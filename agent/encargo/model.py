"""The Gemini model behind the agent, with hedged requests.

On stage the whole errand must finish in under two minutes. A model call
usually answers in about two seconds, but on a busy shared endpoint some calls
take 15–90 s (measured: no 429s, just tail latency). Waiting is the worst
option, so calls are *hedged*: if the first call has not answered after
HEDGE_AFTER_S, an identical second call is sent, then a third; the first answer
wins and the others are cancelled. 429s are retried with backoff by the SDK.
"""

from __future__ import annotations

import asyncio
import copy
import logging
import os
from typing import AsyncGenerator

from google.adk.models import Gemini
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

log = logging.getLogger("encargo.model")


class HedgedGemini(Gemini):
    hedge_after_s: float = float(os.getenv("MODEL_HEDGE_AFTER_S", "6"))
    max_parallel: int = int(os.getenv("MODEL_MAX_PARALLEL", "5"))
    max_attempts: int = 12

    async def _collect(self, request: LlmRequest) -> list[LlmResponse]:
        return [r async for r in super().generate_content_async(request, False)]

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        if stream:  # the agent never streams; keep the stock behavior if it ever does
            async for r in super().generate_content_async(llm_request, stream):
                yield r
            return
        pending: set[asyncio.Task] = set()
        errors: list[BaseException] = []
        started = 0
        try:
            while True:
                # A failed call (e.g. 504 DEADLINE_EXCEEDED) frees its slot for a fresh one,
                # up to max_attempts calls in total for this turn.
                if len(pending) < self.max_parallel and started < self.max_attempts:
                    if started:
                        log.warning("model call slow or failed, sending call #%s (%s errors)", started + 1, len(errors))
                    pending.add(asyncio.create_task(self._collect(copy.deepcopy(llm_request))))
                    started += 1
                    timeout = self.hedge_after_s
                else:
                    timeout = None
                if not pending:
                    raise errors[-1]
                done, pending = await asyncio.wait(pending, timeout=timeout, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    if task.exception() is None:
                        for response in task.result():
                            yield response
                        return
                    errors.append(task.exception())
        finally:
            # Losing calls are left to finish on their own, not cancelled: cancelling
            # in-flight HTTP requests can leave pooled connections stuck, and after a
            # few runs every new call waits on the pool (seen on Cloud Run).
            for task in pending:
                task.add_done_callback(_swallow)


def _swallow(task: asyncio.Task) -> None:
    if not task.cancelled():
        task.exception()


def build_model(name: str) -> HedgedGemini:
    return HedgedGemini(
        model=name,
        retry_options=types.HttpRetryOptions(attempts=5, initial_delay=1.0, max_delay=8.0, http_status_codes=[429, 500, 503]),
    )
