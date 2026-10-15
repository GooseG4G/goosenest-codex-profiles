from typing import Any

from main import app


def _schemas(value: Any, components: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [schema for item in value for schema in _schemas(item, components)]
    if not isinstance(value, dict):
        return []
    reference = value.get("$ref")
    if isinstance(reference, str):
        name = reference.rsplit("/", 1)[-1]
        return [components[name], *_schemas(components[name], components)]
    nested = (
        schema for item in value.values() for schema in _schemas(item, components)
    )
    return [value, *nested]


def test_rest_paths_have_no_trailing_slash() -> None:
    schema = app.openapi()

    assert all(path == "/" or not path.endswith("/") for path in schema["paths"])


def test_operation_ids_are_unique() -> None:
    schema = app.openapi()
    operation_ids = [
        operation["operationId"]
        for path in schema["paths"].values()
        for method, operation in path.items()
        if method != "parameters" and "operationId" in operation
    ]

    assert len(operation_ids) == len(set(operation_ids))


def test_no_password_is_exposed_by_response_models() -> None:
    schema = app.openapi()
    components = schema["components"]["schemas"]

    for path in schema["paths"].values():
        for method, operation in path.items():
            if method == "parameters":
                continue
            for response in operation.get("responses", {}).values():
                for media in response.get("content", {}).values():
                    response_schemas = _schemas(media.get("schema", {}), components)
                    assert all(
                        "password" not in item.get("properties", {})
                        for item in response_schemas
                    )


def test_no_content_responses_have_no_body_schema() -> None:
    schema = app.openapi()

    for path in schema["paths"].values():
        for method, operation in path.items():
            if method == "parameters":
                continue
            response = operation.get("responses", {}).get("204")
            if response is not None:
                assert "content" not in response


def test_username_is_immutable() -> None:
    schema = app.openapi()

    user_update = schema["components"]["schemas"]["UserUpdate"]

    assert "username" not in user_update["properties"]
    assert user_update["additionalProperties"] is False


def test_device_auth_can_target_an_existing_profile() -> None:
    schema = app.openapi()
    operation = schema["paths"]["/api/v1/device/auth"]["post"]

    profile_id = next(
        parameter
        for parameter in operation["parameters"]
        if parameter["name"] == "profile_id"
    )
    assert profile_id["in"] == "query"
    assert profile_id["required"] is False


def test_device_auth_can_be_cancelled() -> None:
    schema = app.openapi()
    operation = schema["paths"]["/api/v1/device/auth/{uid}"]["delete"]

    assert "204" in operation["responses"]


def test_usage_resources_have_distinct_entity_types() -> None:
    schema = app.openapi()
    components = schema["components"]["schemas"]

    assert components["UsageLimitsMeta"]["properties"]["type"]["const"] == (
        "profile-usage-limits"
    )
    assert components["UsageResetsMeta"]["properties"]["type"]["const"] == (
        "profile-usage-resets"
    )
    assert components["UsageResetMeta"]["properties"]["type"]["const"] == (
        "profile-usage-reset"
    )


def test_profile_plan_endpoint_is_available() -> None:
    schema = app.openapi()

    assert "/api/v1/profiles/{profile_id}/plan" in schema["paths"]
    assert (
        schema["paths"]["/api/v1/profiles/{profile_id}/plan"]["get"]
        ["responses"]["200"]["content"]["application/json"]["schema"]
        ["$ref"]
        == "#/components/schemas/ProfilePlan"
    )
