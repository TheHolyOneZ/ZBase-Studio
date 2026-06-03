use base64::{Engine, engine::general_purpose::STANDARD as B64};
use duckdb::types::Value as DuckValue;
use serde_json::Value as JsonValue;

pub fn duck_value_to_json(v: DuckValue) -> JsonValue {
    match v {
        DuckValue::Null => JsonValue::Null,
        DuckValue::Boolean(b) => JsonValue::Bool(b),
        DuckValue::TinyInt(i) => JsonValue::Number(i.into()),
        DuckValue::SmallInt(i) => JsonValue::Number(i.into()),
        DuckValue::Int(i) => JsonValue::Number(i.into()),
        DuckValue::BigInt(i) => JsonValue::Number(i.into()),
        DuckValue::HugeInt(i) => JsonValue::String(i.to_string()),
        DuckValue::UTinyInt(i) => JsonValue::Number(i.into()),
        DuckValue::USmallInt(i) => JsonValue::Number(i.into()),
        DuckValue::UInt(i) => JsonValue::Number(i.into()),
        DuckValue::UBigInt(i) => JsonValue::Number(serde_json::Number::from(i)),
        DuckValue::Float(f) => serde_json::Number::from_f64(f as f64)
            .map(JsonValue::Number)
            .unwrap_or(JsonValue::Null),
        DuckValue::Double(f) => serde_json::Number::from_f64(f)
            .map(JsonValue::Number)
            .unwrap_or(JsonValue::Null),
        DuckValue::Decimal(d) => JsonValue::String(d.to_string()),
        DuckValue::Text(s) => JsonValue::String(s),
        DuckValue::Blob(b) => serde_json::json!({ "__blob": B64.encode(&b) }),
        DuckValue::Date32(d) => JsonValue::String(format!("Date({})", d)),
        DuckValue::Time64(_, t) => JsonValue::String(format!("Time({})", t)),
        DuckValue::Timestamp(_, ts) => JsonValue::String(format!("Timestamp({})", ts)),
        DuckValue::Interval { months, days, nanos } => {
            JsonValue::String(format!("{}mo {}d {}ns", months, days, nanos))
        }
        DuckValue::List(vals) => {
            JsonValue::Array(vals.into_iter().map(duck_value_to_json).collect())
        }
        DuckValue::Array(vals) => {
            JsonValue::Array(vals.into_iter().map(duck_value_to_json).collect())
        }
        DuckValue::Enum(s) => JsonValue::String(s),
        DuckValue::Struct(map) => {
            let obj: serde_json::Map<String, JsonValue> = map
                .iter()
                .map(|(k, v)| (k.clone(), duck_value_to_json(v.clone())))
                .collect();
            JsonValue::Object(obj)
        }
        DuckValue::Union(inner) => duck_value_to_json(*inner),
        DuckValue::Map(pairs) => JsonValue::Array(
            pairs
                .iter()
                .map(|(k, v)| {
                    serde_json::json!([duck_value_to_json(k.clone()), duck_value_to_json(v.clone())])
                })
                .collect(),
        ),
    }
}
