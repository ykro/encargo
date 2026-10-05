import json

from encargo.replay_check import REPLAYS_DIR, fingerprint, problems

GOOD = [{"type": "run_started"}, {"type": "mandate_signed"}, {"type": "order_confirmed"}, {"type": "run_finished"}]


def test_fingerprint_changes_with_catalog_or_errand_only():
    base = fingerprint(b'{"products": []}', "Tenis talla 9.")
    assert base == fingerprint(b'{"products": []}', "Tenis talla 9.")
    assert base != fingerprint(b'{"products": [1]}', "Tenis talla 9.")
    assert base != fingerprint(b'{"products": []}', "Tenis talla 10.")


def test_a_recording_does_not_expire_with_the_calendar():
    current = fingerprint(b"c")
    body = {"fingerprint": current, "recorded_at": "2020-01-01T00:00:00+0000", "events": GOOD}
    assert problems(body, current) == []


def test_stale_or_incomplete_recordings_are_rejected():
    current = fingerprint(b"c")
    assert problems({"fingerprint": "old", "events": GOOD}, current) == ["el catálogo o el encargo cambiaron desde que se grabó"]
    assert "la grabación no termina en un pedido confirmado" in problems({"fingerprint": current, "events": GOOD[:2]}, current)
    assert "la grabación no tiene la firma del mandato" in problems({"fingerprint": current, "events": [GOOD[0], GOOD[2]]}, current)


def test_committed_recordings_match_the_current_catalog_and_errand():
    current = fingerprint()
    for name in ("kilometro", "pulso-control"):
        body = json.loads((REPLAYS_DIR / f"{name}.json").read_text())
        assert problems(body, current) == [], name
