"""Firestore RunStore (named database `encargo`).

Layout: runs/{run_id}, runs/{run_id}/events/{seq:06d}, mandates/{id},
orders/{id}, screenshots/{id}. Events are a subcollection so reading "events
after N" needs no composite index.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from google.cloud import firestore


class FirestoreRunStore:
    def __init__(self, project: str, database: str) -> None:
        self.db = firestore.AsyncClient(project=project, database=database)
        # One process drives a run, so a local counter orders its events.
        self._seq: dict[str, int] = defaultdict(int)

    async def create_run(self, run: dict[str, Any]) -> None:
        await self.db.collection("runs").document(run["id"]).set(run)

    async def get_run(self, run_id: str) -> dict[str, Any] | None:
        snap = await self.db.collection("runs").document(run_id).get()
        return snap.to_dict() if snap.exists else None

    async def update_run(self, run_id: str, fields: dict[str, Any]) -> None:
        await self.db.collection("runs").document(run_id).set(fields, merge=True)

    async def append_event(self, run_id: str, event: dict[str, Any]) -> int:
        if self._seq[run_id] == 0:
            existing = self.db.collection("runs").document(run_id).collection("events")
            docs = [d async for d in existing.order_by("seq", direction=firestore.Query.DESCENDING).limit(1).stream()]
            self._seq[run_id] = docs[0].to_dict()["seq"] if docs else 0
        self._seq[run_id] += 1
        seq = self._seq[run_id]
        ref = self.db.collection("runs").document(run_id).collection("events").document(f"{seq:06d}")
        await ref.set({**event, "seq": seq})
        return seq

    async def list_events(self, run_id: str, after_seq: int = 0) -> list[dict[str, Any]]:
        col = self.db.collection("runs").document(run_id).collection("events")
        query = col.where(filter=firestore.FieldFilter("seq", ">", after_seq)).order_by("seq")
        return [d.to_dict() async for d in query.stream()]

    async def save_mandate(self, mandate: dict[str, Any]) -> None:
        await self.db.collection("mandates").document(mandate["id"]).set(mandate)

    async def get_mandate(self, mandate_id: str) -> dict[str, Any] | None:
        snap = await self.db.collection("mandates").document(mandate_id).get()
        return snap.to_dict() if snap.exists else None

    async def update_mandate(self, mandate_id: str, fields: dict[str, Any]) -> None:
        await self.db.collection("mandates").document(mandate_id).set(fields, merge=True)

    async def save_order(self, order: dict[str, Any]) -> None:
        await self.db.collection("orders").document(order["id"]).set(order)

    async def list_orders(self) -> list[dict[str, Any]]:
        return [d.to_dict() async for d in self.db.collection("orders").stream()]

    async def save_screenshot(self, shot_id: str, data: dict[str, Any]) -> None:
        await self.db.collection("screenshots").document(shot_id).set(data)

    async def get_screenshot(self, shot_id: str) -> dict[str, Any] | None:
        snap = await self.db.collection("screenshots").document(shot_id).get()
        return snap.to_dict() if snap.exists else None

    async def latest_run(self) -> dict[str, Any] | None:
        query = self.db.collection("runs").order_by("created_at", direction=firestore.Query.DESCENDING).limit(1)
        docs = [d.to_dict() async for d in query.stream()]
        return docs[0] if docs else None

    async def save_passkey(self, passkey: dict[str, Any]) -> None:
        await self.db.collection("passkeys").document(passkey["id"]).set(passkey)

    async def list_passkeys(self) -> list[dict[str, Any]]:
        return [d.to_dict() async for d in self.db.collection("passkeys").stream()]

    async def update_passkey(self, passkey_id: str, fields: dict[str, Any]) -> None:
        await self.db.collection("passkeys").document(passkey_id).set(fields, merge=True)

    async def delete_passkey(self, passkey_id: str) -> None:
        await self.db.collection("passkeys").document(passkey_id).delete()

    async def save_challenge(self, flow_id: str, data: dict[str, Any]) -> None:
        await self.db.collection("webauthn_challenges").document(flow_id).set(data)

    async def pop_challenge(self, flow_id: str) -> dict[str, Any] | None:
        ref = self.db.collection("webauthn_challenges").document(flow_id)
        snap = await ref.get()
        if not snap.exists:
            return None
        await ref.delete()
        return snap.to_dict()

    async def reset(self) -> None:
        for name in ("runs", "mandates", "orders", "screenshots"):
            await self.db.recursive_delete(self.db.collection(name))
        self._seq.clear()
