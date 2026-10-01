from datetime import date

import pytest

from encargo.errand import DEFAULT_ERRAND, add_business_days, next_weekday, parse_errand


def test_parses_the_four_conditions():
    conditions = {c.id: c for c in parse_errand(DEFAULT_ERRAND, date(2026, 9, 30))}
    assert conditions["categoria"].value == "trail"
    assert conditions["talla"].value == "9"
    assert conditions["precio"].value == "150"
    assert conditions["entrega"].value == "2026-10-02"  # Wednesday → that Friday


@pytest.mark.parametrize(
    "run_date,friday",
    [
        (date(2026, 9, 28), date(2026, 10, 2)),  # Monday
        (date(2026, 10, 1), date(2026, 10, 2)),  # Thursday → tomorrow
        (date(2026, 10, 2), date(2026, 10, 9)),  # Friday → next week's Friday
        (date(2026, 10, 3), date(2026, 10, 9)),  # Saturday
    ],
)
def test_friday_is_the_first_friday_after_the_run_date(run_date, friday):
    assert next_weekday(run_date, 4) == friday


@pytest.mark.parametrize("run_date", [date(2026, 9, 28) + __import__("datetime").timedelta(days=i) for i in range(7)])
def test_errand_model_always_arrives_in_time_and_slow_model_never_does(run_date):
    friday = next_weekday(run_date, 4)
    assert add_business_days(run_date, 1) <= friday  # errand model: 0 + 1 business days
    assert add_business_days(run_date, 7) > friday  # Fuego Tormenta: at least 7 business days
