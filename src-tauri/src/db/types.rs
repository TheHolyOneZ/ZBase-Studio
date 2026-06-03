use base64::{Engine, engine::general_purpose::STANDARD as B64};
use rusqlite::types::Value;
use serde_json::Value as JsonValue;

pub fn value_to_json(v: Value) -> JsonValue {
    match v {
        Value::Null => JsonValue::Null,
        Value::Integer(i) => JsonValue::Number(i.into()),
        Value::Real(f) => serde_json::Number::from_f64(f)
            .map(JsonValue::Number)
            .unwrap_or(JsonValue::Null),
        Value::Text(s) => JsonValue::String(s),
        Value::Blob(b) => {
            let encoded = B64.encode(&b);
            serde_json::json!({ "__blob": encoded })
        }
    }
}

pub fn json_to_value(v: JsonValue) -> Value {
    match v {
        JsonValue::Null => Value::Null,
        JsonValue::Bool(b) => Value::Integer(if b { 1 } else { 0 }),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                Value::Real(f)
            } else {
                Value::Null
            }
        }
        JsonValue::String(s) => Value::Text(s),
        JsonValue::Object(ref o) => {
            if let Some(JsonValue::String(b64)) = o.get("__blob") {
                if let Ok(bytes) = B64.decode(b64) {
                    return Value::Blob(bytes);
                }
            }
            Value::Text(v.to_string())
        }
        JsonValue::Array(_) => Value::Text(v.to_string()),
    }
}
