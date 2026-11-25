"""SuperJLU Studio 桌面端服务端、网络诊断与登录异常引导集成测试。"""
import http.client
import json
import ssl
import threading
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from http.server import ThreadingHTTPServer

import pytest

from jlu_toolkit import connectivity, core, exams, jwxt, network, ui

pytestmark = pytest.mark.real_ui_auth


@pytest.fixture
def studio_srv(tmp_path):
    (tmp_path / "settings.json").write_text(json.dumps({"first_monday": "2026-09-07"}), encoding="utf-8")
    store = ui.Store(tmp_path)
    handler = ui.make_handler(store)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield httpd.server_address[1], handler.auth_token, tmp_path, store
    httpd.shutdown()
    httpd.server_close()


def _req(port, method, path, headers=None, body=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    hdrs = {"Host": "127.0.0.1", **(headers or {})}
    if body is not None:
        hdrs.setdefault("Content-Type", "application/json")
        body = json.dumps(body).encode("utf-8")
    c.request(method, path, body=body, headers=hdrs)
    r = c.getresponse()
    return r.status, dict(r.getheaders()), r.read()


def test_unauthorized_rejected(studio_srv):
    port, _, _, _ = studio_srv
    st, _, _ = _req(port, "GET", "/api/data")
    assert st == 401
    st2, _, _ = _req(port, "GET", "/")
    assert st2 == 401


def test_frontend_dist_served_without_demo(studio_srv):
    port, token, _, _ = studio_srv
    hdrs = {ui.TOKEN_HEADER: token}
    st, _, raw = _req(port, "GET", "/", hdrs)
    assert st == 200
    text = raw.decode("utf-8")
    assert "window.__PREFS=" in text and "window.__SUPERJLU__=" in text
    assert '"demo"' not in text
    assert "/assets/" in text

    import re
    m = re.search(r'/assets/[^"\']+\.js', text)
    assert m, "index.html should reference bundled JS asset"
    st_js, rh_js, _ = _req(port, "GET", m.group(0), hdrs)
    assert st_js == 200 and "javascript" in rh_js.get("Content-Type", "")

    st_trav, _, _ = _req(port, "GET", "/assets/../../pyproject.toml", hdrs)
    assert st_trav == 404

    st_fav, _, _ = _req(port, "GET", "/favicon.svg")
    assert st_fav == 200

    st_snap, _, snap_raw = _req(port, "GET", "/api/data", hdrs)
    assert st_snap == 200
    snap = json.loads(snap_raw)
    assert "demo" not in snap

    # 已移除演示模式端点
    assert _req(port, "GET", "/api/demo/status", hdrs)[0] == 404
    assert _req(port, "POST", "/api/demo/toggle", hdrs, {"enabled": True})[0] == 404


def test_login_and_vpn_network_error_hints(tmp_path, monkeypatch):
    def fail_request(self, *args, **kwargs):
        raise jwxt.NetworkError("连接或响应超时，请稍后重试", "timeout")

    monkeypatch.setattr(jwxt.JwxtClient, "_request", fail_request)
    store = ui.Store(tmp_path)
    handler = ui.make_handler(store)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    port, token = httpd.server_address[1], handler.auth_token
    hdrs = {ui.TOKEN_HEADER: token}
    try:
        st1, _, raw1 = _req(
            port,
            "POST",
            "/api/login/start",
            hdrs,
            {"username": "u", "password": "p", "remember": False},
        )
        d1 = json.loads(raw1)
        assert st1 == 502 and d1["vpn_hint"] is True and d1["error_kind"] == "timeout"

        st2, _, raw2 = _req(
            port,
            "POST",
            "/api/vpn/login/start",
            hdrs,
            {"username": "u", "password": "p", "remember": False},
        )
        d2 = json.loads(raw2)
        assert st2 == 502 and d2["direct_hint"] is True and d2["network_error"] is True
        assert d2["error_kind"] == "timeout"
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_network_check_recommended_route_and_prefs_links(studio_srv, monkeypatch):
    port, token, _, _ = studio_srv
    hdrs = {ui.TOKEN_HEADER: token}

    def fake_one(target, timeout=6):
        sid, name, _ = target
        reachable = sid != "vpn"
        return {
            "id": sid,
            "name": name,
            "host": sid,
            "port": 443,
            "reachable": reachable,
            "authentication_checked": False,
            "milliseconds": 12 if reachable else 5000,
        }

    monkeypatch.setattr(connectivity, "check_one", fake_one)
    st, _, raw = _req(port, "POST", "/api/network/check", hdrs, {})
    assert st == 200
    rep = json.loads(raw)
    assert rep["recommended_route"] == "direct"
    assert "校园网直连" in rep["route_hint"]

    st_lk, _, raw_lk = _req(port, "GET", "/api/links", hdrs)
    assert st_lk == 200 and len(json.loads(raw_lk)["links"]) >= 5

    st_pf, _, _ = _req(port, "POST", "/api/prefs", hdrs, {"set": {"jlu-theme": "dark"}})
    assert st_pf == 200
    st_pg, _, raw_pg = _req(port, "GET", "/api/prefs", hdrs)
    assert st_pg == 200 and json.loads(raw_pg)["prefs"]["jlu-theme"] == "dark"


def test_native_open_safe_get_falls_back_to_python_https_without_replaying_unsafe(monkeypatch):
    monkeypatch.setattr(network, "native_available", lambda: True)
    monkeypatch.setattr(network.time, "sleep", lambda _: None)

    native_calls = []

    def fail_native(req, timeout):
        native_calls.append(req.full_url)
        raise OSError(12002, "winhttp timeout")

    py_calls = []

    def ok_python(self, req):
        py_calls.append(req.full_url)
        return network._response(req, 200, "Content-Type: text/plain\r\n", b"fallback-ok")

    monkeypatch.setattr(network, "native_open", fail_native)
    monkeypatch.setattr(urllib.request.HTTPSHandler, "https_open", ok_python)

    h = network.SchoolHTTPSHandler(
        ssl.create_default_context(),
        native_hosts={"cas.jlu.edu.cn"},
    )
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()), h)
    with opener.open("https://cas.jlu.edu.cn/tpass/login", timeout=5) as resp:
        assert resp.read() == b"fallback-ok"
    assert len(native_calls) == 1 and len(py_calls) == 1
    assert "cas.jlu.edu.cn" not in h.native_hosts

    # 不安全请求（POST / ticket=）禁止回退重试
    h2 = network.SchoolHTTPSHandler(
        ssl.create_default_context(),
        native_hosts={"cas.jlu.edu.cn", "iedu.jlu.edu.cn"},
    )
    py_calls.clear()
    req_post = urllib.request.Request("https://cas.jlu.edu.cn/tpass/login", data=b"rsa=x")
    req_post.timeout = 5
    with pytest.raises(OSError):
        h2.https_open(req_post)
    assert py_calls == []

    req_ticket = urllib.request.Request("https://iedu.jlu.edu.cn/?ticket=ST-secret")
    req_ticket.timeout = 5
    with pytest.raises(OSError):
        h2.https_open(req_ticket)
    assert py_calls == []


def test_custom_exams_ics_and_schedule_settings(tmp_path):
    # 没有带日期考试时，scope=exams 返回 400
    (tmp_path / "settings.json").write_text("{}", encoding="utf-8")
    store = ui.Store(tmp_path)
    handler = ui.make_handler(store)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    port, token = httpd.server_address[1], handler.auth_token
    hdrs = {ui.TOKEN_HEADER: token}

    try:
        st0, _, _ = _req(port, "GET", "/api/ics?scope=exams", hdrs)
        assert st0 == 400

        # 写入官方考试与课程缓存，校验自定义考试不覆盖 exams.csv
        exams.export_exams_csv(
            [exams.Exam("高等数学", "2026-12-30T18:00", "2026-12-30T20:00", "逸夫楼 A101", "12", "期末考试", "2026-2027-1")],
            str(tmp_path / "exams.csv"),
        )
        jwxt.export_courses_csv(
            [core.Course("计算机网络", "张老师", "敬信 F201", 1, 1, 2, [1, 2])],
            str(tmp_path / "schedule.csv"),
        )

        # 校历未设时，仅导出考试日历仍可用（且只包含已添加的考试）
        st_ex_only, rh_ex, raw_ex = _req(port, "GET", "/api/ics?scope=exams", hdrs)
        assert st_ex_only == 200
        assert "jlu-exams.ics" in rh_ex.get("Content-Disposition", "")
        ics_ex = raw_ex.decode("utf-8")
        assert "SUMMARY:[考试] 高等数学" in ics_ex and "TRIGGER:-PT30M" in ics_ex
        assert "计算机网络" not in ics_ex

        # 校验无效参数拒绝（空名称 / 结束早于开始）
        assert _req(port, "POST", "/api/exams/custom", hdrs, {"action": "add", "name": "   "})[0] == 400
        assert (
            _req(
                port,
                "POST",
                "/api/exams/custom",
                hdrs,
                {"action": "add", "name": "期中测试", "start": "2026-11-20T11:30", "end": "2026-11-20T09:30"},
            )[0]
            == 400
        )

        # 添加自定义考试
        st_add, _, raw_add = _req(
            port,
            "POST",
            "/api/exams/custom",
            hdrs,
            {
                "action": "add",
                "name": "算法设计与分析",
                "start": "2026-11-20T09:30",
                "end": "2026-11-20T11:30",
                "location": "逸夫楼 B202",
                "seat": "18",
                "kind": "期中考试",
            },
        )
        assert st_add == 200
        snap = json.loads(raw_add)
        assert len(snap["exams"]) == 2
        official_items = [x for x in snap["exams"] if x.get("src") == "official"]
        custom_items = [x for x in snap["exams"] if x.get("src") == "custom"]
        assert len(official_items) == 1 and len(custom_items) == 1
        assert official_items[0]["name"] == "高等数学"
        cid = custom_items[0]["id"]
        assert len(exams.load_exams(str(tmp_path / "exams.csv"))) == 1  # exams.csv 未被改动

        # 更新自定义考试
        st_upd, _, raw_upd = _req(
            port,
            "POST",
            "/api/exams/custom",
            hdrs,
            {
                "action": "update",
                "id": cid,
                "name": "算法设计与分析（改期）",
                "start": "2026-11-21T14:00",
                "end": "2026-11-21T16:00",
                "location": "敬信楼 F305",
                "seat": "20",
                "kind": "期中考试",
            },
        )
        assert st_upd == 200
        upd_snap = json.loads(raw_upd)
        assert any(x["name"] == "算法设计与分析（改期）" and x["id"] == cid for x in upd_snap["exams"])

        # 设置开学周一并校验综合日历导出同时含课程和考试（官方 + 自定义）
        assert _req(port, "POST", "/api/settings", hdrs, {"first_monday": "2026-09-07", "show_exams_in_schedule": False})[0] == 200
        st_set, _, raw_set = _req(port, "GET", "/api/data", hdrs)
        assert st_set == 200 and json.loads(raw_set)["settings"]["show_exams_in_schedule"] is False

        st_ics, rh_ics, raw_ics = _req(port, "GET", "/api/ics", hdrs)
        assert st_ics == 200
        assert "jlu-schedule.ics" in rh_ics.get("Content-Disposition", "")
        ics_all = raw_ics.decode("utf-8")
        assert "SUMMARY:计算机网络" in ics_all
        assert "SUMMARY:[考试] 高等数学" in ics_all
        assert "SUMMARY:[考试] 算法设计与分析（改期）" in ics_all
        assert "TRIGGER:-PT15M" in ics_all and "TRIGGER:-PT30M" in ics_all

        # 删除自定义考试，官方考试保留
        st_del, _, raw_del = _req(port, "POST", "/api/exams/custom", hdrs, {"action": "delete", "id": cid})
        assert st_del == 200
        del_snap = json.loads(raw_del)
        assert len(del_snap["exams"]) == 1 and del_snap["exams"][0]["src"] == "official"
    finally:
        httpd.shutdown()
        httpd.server_close()

