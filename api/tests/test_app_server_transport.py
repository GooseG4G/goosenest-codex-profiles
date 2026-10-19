import json
import asyncio

from api.v1.response.app_server_transport import (
    AppServerProtocolError,
    ResponsesAppServerSession,
    responses_to_app_server_params,
    rpc_request,
    sse_event,
)


def test_rpc_request_is_json_rpc_2_request() -> None:
    payload = json.loads(rpc_request(3, "thread/start", {"model": "gpt-5"}))
    assert payload == {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "thread/start",
        "params": {"model": "gpt-5"},
    }


def test_notification_is_encoded_as_sse() -> None:
    value = sse_event({"method": "item/agentMessage/delta", "params": {"text": "ok"}})
    assert value.startswith(b"event: item/agentMessage/delta\n")
    assert b'"text":"ok"' in value
    assert value.endswith(b"\n\n")


def test_turn_requires_thread() -> None:
    class Transport:
        async def call(self, method, params):
            return {}

    session = ResponsesAppServerSession(Transport())
    import asyncio

    try:
        asyncio.run(session.start_turn({}))
    except AppServerProtocolError as error:
        assert "thread" in str(error)
    else:
        raise AssertionError("turn started without thread")


def test_responses_body_maps_to_thread_and_turn_params() -> None:
    thread, turn = responses_to_app_server_params(
        json.dumps({"model": "gpt-5", "input": [{"role": "user"}], "effort": "high"}).encode(),
        cwd="/workspace",
    )
    assert thread == {"cwd": "/workspace", "model": "gpt-5"}
    assert turn == {"input": [{"role": "user"}], "model": "gpt-5", "effort": "high"}


def test_turn_sse_maps_notifications() -> None:
    class Transport:
        async def call(self, method, params):
            return {"thread": {"id": "thr-1"}}

        async def call_stream(self, method, params):
            yield {"method": "turn/started", "params": {"id": "turn-1"}}

    async def run():
        session = ResponsesAppServerSession(Transport())
        await session.start_thread({})
        return [frame async for frame in session.turn_sse({"input": []})]

    import asyncio

    frames = asyncio.run(run())
    assert frames[0].startswith(b"event: turn/started\n")


def test_websocket_initialize_and_rpc_roundtrip() -> None:
    import websockets

    async def run() -> None:
        async def handler(socket):
            async for raw in socket:
                request = json.loads(raw)
                if request.get("method") == "initialize":
                    await socket.send(json.dumps({"id": request["id"], "result": {"ok": True}}))
                elif request.get("method") == "thread/start":
                    await socket.send(json.dumps({"id": request["id"], "result": {"thread": {"id": "thr-1"}}}))
                elif request.get("method") == "turn/start":
                    await socket.send(json.dumps({"id": request["id"], "result": {"turn": {"id": "turn-1"}}}))
                    await socket.send(json.dumps({"method": "item/agentMessage/delta", "params": {"text": "ok"}}))

        server = await websockets.serve(handler, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        from api.v1.response.app_server_transport import AppServerTransport

        transport = AppServerTransport(f"ws://127.0.0.1:{port}")
        await transport.connect()
        session = ResponsesAppServerSession(transport)
        result = await session.start_thread({})
        assert result["thread"]["id"] == "thr-1"
        turn = await session.start_turn({"input": []})
        assert turn["turn"]["id"] == "turn-1"
        event = await anext(transport.events())
        assert event["method"] == "item/agentMessage/delta"
        await transport.close()
        server.close()
        await server.wait_closed()

    asyncio.run(run())
