def test_growth_ai_scheduler_is_importable():
    from services import growth_ai_scheduler

    assert hasattr(growth_ai_scheduler, "run_growth_ai_cycle")
