export const FISCAL_VISUAL_RESPONSE_SCHEMA = {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "summary": {
      "type": "string"
    },
    "apparentCompletion": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "value": {
          "anyOf": [
            {
              "type": "number",
              "minimum": 0,
              "maximum": 100
            },
            {
              "type": "null"
            }
          ]
        },
        "classification": {
          "type": "string",
          "enum": [
            "FACT",
            "HYPOTHESIS",
            "UNKNOWN"
          ]
        },
        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "evidence": {
          "type": "string"
        }
      },
      "required": [
        "value",
        "classification",
        "confidence",
        "evidence"
      ]
    },
    "visibleCanonicalFutureElements": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "value": {
          "anyOf": [
            {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "classification": {
          "type": "string",
          "enum": [
            "FACT",
            "HYPOTHESIS",
            "UNKNOWN"
          ]
        },
        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "evidence": {
          "type": "string"
        }
      },
      "required": [
        "value",
        "classification",
        "confidence",
        "evidence"
      ]
    },
    "missingVisibleEvidence": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "value": {
          "anyOf": [
            {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            {
              "type": "null"
            }
          ]
        },
        "classification": {
          "type": "string",
          "enum": [
            "FACT",
            "HYPOTHESIS",
            "UNKNOWN"
          ]
        },
        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "evidence": {
          "type": "string"
        }
      },
      "required": [
        "value",
        "classification",
        "confidence",
        "evidence"
      ]
    },
    "workerContinuity": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "value": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "MATCH",
                "MINOR_DIVERGENCE",
                "MAJOR_DIVERGENCE"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "classification": {
          "type": "string",
          "enum": [
            "FACT",
            "HYPOTHESIS",
            "UNKNOWN"
          ]
        },
        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "evidence": {
          "type": "string"
        }
      },
      "required": [
        "value",
        "classification",
        "confidence",
        "evidence"
      ]
    },
    "environmentContinuity": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "value": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "MATCH",
                "MINOR_DIVERGENCE",
                "MAJOR_DIVERGENCE"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "classification": {
          "type": "string",
          "enum": [
            "FACT",
            "HYPOTHESIS",
            "UNKNOWN"
          ]
        },
        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "evidence": {
          "type": "string"
        }
      },
      "required": [
        "value",
        "classification",
        "confidence",
        "evidence"
      ]
    },
    "geometryContinuity": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "value": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "MATCH",
                "MINOR_DIVERGENCE",
                "MAJOR_DIVERGENCE"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "classification": {
          "type": "string",
          "enum": [
            "FACT",
            "HYPOTHESIS",
            "UNKNOWN"
          ]
        },
        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "evidence": {
          "type": "string"
        }
      },
      "required": [
        "value",
        "classification",
        "confidence",
        "evidence"
      ]
    },
    "sourceContinuity": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "value": {
          "anyOf": [
            {
              "type": "string",
              "enum": [
                "MATCH",
                "MINOR_DIVERGENCE",
                "MAJOR_DIVERGENCE"
              ]
            },
            {
              "type": "null"
            }
          ]
        },
        "classification": {
          "type": "string",
          "enum": [
            "FACT",
            "HYPOTHESIS",
            "UNKNOWN"
          ]
        },
        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "evidence": {
          "type": "string"
        }
      },
      "required": [
        "value",
        "classification",
        "confidence",
        "evidence"
      ]
    },
    "uncertainties": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "summary",
    "apparentCompletion",
    "visibleCanonicalFutureElements",
    "missingVisibleEvidence",
    "workerContinuity",
    "environmentContinuity",
    "geometryContinuity",
    "sourceContinuity",
    "uncertainties"
  ]
};

export const FISCAL_VISUAL_ANALYSIS_PROMPT = "You are the Construction Fiscal visual inspector for Construction AI Studio.\nThe supplied image is usually a chronological contact sheet from one generated construction video clip: LEFT=start, CENTER=midpoint, RIGHT=end.\n\nFollow the user's job context exactly.\nEvaluate ONLY the current operation and its authorized progress target, never total building completion.\n\nRules:\n- apparentCompletion: estimate completion of the CURRENT OPERATION in the RIGHT/end panel only.\n- Use LEFT and CENTER as evidence of progression and continuity.\n- If progress cannot be visually supported, return UNKNOWN with null value. Never guess.\n- visibleCanonicalFutureElements: report only forbidden future elements explicitly listed in the user's job context and visibly present. Use their exact canonical IDs.\n- missingVisibleEvidence: report required visible results from the user's job context that are not visibly demonstrated.\n- workerContinuity: compare worker identity, clothing and body continuity across the three panels.\n- environmentContinuity: compare terrain, vegetation, creek/background, weather and lighting.\n- geometryContinuity: detect unauthorized changes to built geometry or terrain outside the current action.\n- sourceContinuity: judge whether the generated clip clearly continues from the LEFT/source state rather than resetting or redesigning it.\n- MATCH means materially preserved.\n- MINOR_DIVERGENCE means a small non-destructive difference.\n- MAJOR_DIVERGENCE means a clear continuity break that should trigger regeneration.\n- FACT only when directly visible.\n- HYPOTHESIS only when plausible but not fully certain.\n- UNKNOWN when not visually supportable.\n- Do not infer hidden work, structural capacity, exact dimensions or invisible prerequisites.\n\nReturn only JSON matching the supplied schema.";
