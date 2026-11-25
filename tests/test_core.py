from jlu_toolkit import core
def test_weeks(): assert core.parse_weeks("1-5单") == [1,3,5]
def test_point(): assert core.score_to_point("85") == 3.5 and core.score_to_point("59") == 0.0 and core.score_to_point("通过") is None
def test_gpa(tmp_path):
    p = tmp_path / "grades.csv"
    p.write_text(
        "课程,学分,成绩,学期\n"
        "高等数学,4,90,2026-1\n"
        "线性代数,4,85,2026-1\n"
        "大学英语,3,良好,2026-1\n"
        "程序设计,2,75,2026-1\n"
        "军事理论,1,通过,2026-1\n",
        encoding="utf-8",
    )
    r = core.gpa(core.load_grades(p))
    assert r["credits"] == 13
def test_ics(tmp_path):
    p = tmp_path / "schedule.csv"
    p.write_text(
        "课程,教师,地点,星期,开始节,结束节,周次\n"
        "高等数学,张老师,敬信F101,1,1,2,1-16\n"
        "大学物理,李老师,逸夫A202,3,3,4,1-16单\n"
        "英语读写,王老师,外语楼305,5,5,6,2-16双\n",
        encoding="utf-8",
    )
    s = core.to_ics(core.load_courses(p), "2026-09-07")
    assert s.count("BEGIN:VEVENT") == 16 + 8 + 8
