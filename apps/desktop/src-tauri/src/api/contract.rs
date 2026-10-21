use std::collections::{BTreeMap, BTreeSet};

use schemars::{JsonSchema, schema_for};
use serde_json::Value;

use super::{ApiErrorBody, DictationMeta, DictationResponse, StyleList, UserSettings};

#[derive(Debug, PartialEq, Eq)]
enum Shape {
    Object(BTreeMap<String, Field>),
    Array(Box<Shape>),
    Text(Option<BTreeSet<String>>),
    Integer,
    Number,
    Boolean,
}

#[derive(Debug, PartialEq, Eq)]
struct Field {
    required: bool,
    shape: Shape,
}

fn resolve<'a>(schema: &'a Value, root: &'a Value) -> &'a Value {
    match schema.get("$ref").and_then(Value::as_str) {
        Some(pointer) => resolve(
            root.pointer(pointer.trim_start_matches('#'))
                .unwrap_or_else(|| panic!("unresolved {pointer}")),
            root,
        ),
        None => schema,
    }
}

fn is_null(schema: &Value) -> bool {
    schema.get("type").and_then(Value::as_str) == Some("null")
}

fn texts(values: &[Value]) -> Shape {
    Shape::Text(Some(
        values
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
    ))
}

fn shape(schema: &Value, root: &Value) -> Shape {
    let schema = resolve(schema, root);
    if let Some(variants) = schema
        .get("anyOf")
        .or_else(|| schema.get("oneOf"))
        .and_then(Value::as_array)
    {
        let variants = variants.iter().filter(|v| !is_null(v)).collect::<Vec<_>>();
        if let [only] = variants.as_slice() {
            return shape(only, root);
        }
        let mut union = BTreeSet::new();
        for variant in variants {
            match shape(variant, root) {
                Shape::Text(Some(values)) => union.extend(values),
                other => panic!("unsupported union member {other:?}"),
            }
        }
        return Shape::Text(Some(union));
    }
    if let Some(value) = schema.get("const") {
        return texts(std::slice::from_ref(value));
    }
    if let Some(values) = schema.get("enum").and_then(Value::as_array) {
        return texts(values);
    }
    let kind = match schema.get("type") {
        Some(Value::String(kind)) => kind.as_str(),
        Some(Value::Array(kinds)) => kinds
            .iter()
            .filter_map(Value::as_str)
            .find(|kind| *kind != "null")
            .unwrap_or_else(|| panic!("no type in {schema}")),
        _ => panic!("no type in {schema}"),
    };
    match kind {
        "object" => {
            let required = schema
                .get("required")
                .and_then(Value::as_array)
                .map(|names| {
                    names
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<BTreeSet<_>>()
                })
                .unwrap_or_default();
            let properties = schema
                .get("properties")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            Shape::Object(
                properties
                    .iter()
                    .map(|(name, property)| {
                        let field = Field {
                            required: required.contains(name.as_str()),
                            shape: shape(property, root),
                        };
                        (name.clone(), field)
                    })
                    .collect(),
            )
        }
        "array" => Shape::Array(Box::new(shape(&schema["items"], root))),
        "string" => Shape::Text(None),
        "integer" => Shape::Integer,
        "number" => Shape::Number,
        "boolean" => Shape::Boolean,
        other => panic!("unsupported type {other}"),
    }
}

fn rust<T: JsonSchema>() -> Shape {
    let schema = schema_for!(T).to_value();
    shape(&schema, &schema)
}

#[test]
fn the_rust_mirror_matches_the_shared_contract() {
    let contract: Value = serde_json::from_str(include_str!("contract.schema.json")).unwrap();
    let mirrors = BTreeMap::from([
        ("dictationMeta", rust::<DictationMeta>()),
        ("dictationResponse", rust::<DictationResponse>()),
        ("apiError", rust::<ApiErrorBody>()),
        ("settings", rust::<UserSettings>()),
        ("styleList", rust::<StyleList>()),
    ]);
    let drifted = contract
        .as_object()
        .unwrap()
        .iter()
        .filter_map(|(name, schema)| {
            let shared = shape(schema, schema);
            match mirrors.get(name.as_str()) {
                None => Some(format!("{name}: no Rust mirror")),
                Some(mirror) if *mirror != shared => Some(format!(
                    "{name}:\n  rust:   {mirror:?}\n  shared: {shared:?}"
                )),
                Some(_) => None,
            }
        })
        .collect::<Vec<_>>();
    assert!(drifted.is_empty(), "{}", drifted.join("\n"));
}
