{
  "apiVersion": "dashboard.grafana.app/v2",
  "kind": "Dashboard",
  "metadata": {
    "name": "27f71330-d1af-4fde-b2f8-41285dddef6e",
    "namespace": "stacks-1412373",
    "uid": "e01ae8e8-c5e8-49ff-852c-eb197b68ba21",
    "resourceVersion": "2045161115373011293",
    "generation": 26,
    "creationTimestamp": "2026-04-17T13:54:05Z",
    "labels": {
      "grafana.app/deprecatedInternalID": "504502390951936"
    },
    "annotations": {
      "grafana.app/createdBy": "service-account:afjd95p4uhqtcc",
      "grafana.app/folder": "dfjd968owvfggf",
      "grafana.app/saved-from-ui": "Grafana Cloud",
      "grafana.app/updatedBy": "user:cf1q5zu9i0kxsc",
      "grafana.app/updatedTimestamp": "2026-04-17T15:23:01Z",
      "grafana.app/folderTitle": "icb-test-lat-ICB-GENERATED",
      "grafana.app/folderUrl": "/dashboards/f/dfjd968owvfggf/icbtestlaticbgenerated"
    }
  },
  "spec": {
    "annotations": [
      {
        "kind": "AnnotationQuery",
        "spec": {
          "query": {
            "kind": "DataQuery",
            "group": "grafana",
            "version": "v0",
            "datasource": {
              "name": "-- Grafana --"
            },
            "spec": {}
          },
          "enable": true,
          "hide": true,
          "iconColor": "rgba(0, 211, 255, 1)",
          "name": "Annotations & Alerts",
          "builtIn": true
        }
      }
    ],
    "cursorSync": "Off",
    "editable": true,
    "elements": {
      "panel-1": {
        "kind": "Panel",
        "spec": {
          "id": 1,
          "title": "Logs",
          "description": "",
          "links": [],
          "data": {
            "kind": "QueryGroup",
            "spec": {
              "queries": [
                {
                  "kind": "PanelQuery",
                  "spec": {
                    "query": {
                      "kind": "DataQuery",
                      "group": "cloudwatch",
                      "version": "v0",
                      "datasource": {
                        "name": "efjd96fgdz4sgf"
                      },
                      "spec": {
                        "expression": "fields @Timestamp, trace_id as exploreTraces, trace_id as panelTraces\n    | parse @message '\"body\":\"*\"' as body\n    | parse @message '\"res\":{\"statusCode\":*}' as statusCode\n    | parse @message '\"severity_text\":\"*\"' as logLevel\n    | filter body like /${search_text}/\n    | filter ${status_code}\n    | filter ${log_level}\n    | sort @timestamp desc\n    | limit ${limit}",
                        "logGroups": [
                          {
                            "name": "icb-test-dev-lg"
                          }
                        ],
                        "queryMode": "Logs",
                        "region": "default",
                        "statsGroups": []
                      }
                    },
                    "refId": "A",
                    "hidden": false
                  }
                }
              ],
              "transformations": [
                {
                  "kind": "Transformation",
                  "group": "organize",
                  "spec": {
                    "options": {
                      "excludeByName": {
                        "Value": true
                      },
                      "includeByName": {},
                      "indexByName": {
                        "@timestamp": 0,
                        "body": 3,
                        "logLevel": 2,
                        "statusCode": 1
                      },
                      "renameByName": {
                        "@timestamp": "Timestamp",
                        "body": "Body",
                        "exploreTraces": "Explore Traces",
                        "logLevel": "Log Level",
                        "panelTraces": "Panel Traces",
                        "statusCode": "Status Code",
                        "traceId": "Trace Id"
                      }
                    }
                  }
                },
                {
                  "kind": "Transformation",
                  "group": "sortBy",
                  "spec": {
                    "options": {
                      "sort": [
                        {
                          "desc": true,
                          "field": "Time"
                        }
                      ]
                    }
                  }
                }
              ],
              "queryOptions": {}
            }
          },
          "vizConfig": {
            "kind": "VizConfig",
            "group": "table",
            "version": "13.1.0-24556818486",
            "spec": {
              "options": {
                "cellHeight": "sm",
                "showHeader": true,
                "sortBy": [
                  {
                    "desc": true,
                    "displayName": "Explore Traces"
                  }
                ]
              },
              "fieldConfig": {
                "defaults": {
                  "thresholds": {
                    "mode": "absolute",
                    "steps": [
                      {
                        "value": 0,
                        "color": "green"
                      },
                      {
                        "value": 80,
                        "color": "red"
                      }
                    ]
                  },
                  "custom": {
                    "align": "auto",
                    "cellOptions": {
                      "type": "auto"
                    },
                    "footer": {
                      "reducers": []
                    },
                    "inspect": false
                  }
                },
                "overrides": [
                  {
                    "matcher": {
                      "id": "byName",
                      "scope": "series",
                      "options": "Explore Traces"
                    },
                    "properties": [
                      {
                        "id": "links",
                        "value": [
                          {
                            "targetBlank": true,
                            "title": "Explore traces",
                            "url": "/explore?left={\"datasource\":\"dfjdcu10ysykgc\",\"queries\":[{\"queryType\":\"getTrace\",\"query\":\"${__data.fields.exploreTraces}\"}],\"range\":{\"from\":\"now-1h\",\"to\":\"now\"}}"
                          }
                        ]
                      }
                    ]
                  },
                  {
                    "matcher": {
                      "id": "byName",
                      "scope": "series",
                      "options": "Panel Traces"
                    },
                    "properties": [
                      {
                        "id": "links",
                        "value": [
                          {
                            "targetBlank": false,
                            "title": "Panel traces",
                            "url": "/d/27f71330-d1af-4fde-b2f8-41285dddef6e/icb-grafana-test-logs-and-traces?var-traceId=${__data.fields.panelTraces}"
                          }
                        ]
                      }
                    ]
                  },
                  {
                    "matcher": {
                      "id": "byName",
                      "scope": "series",
                      "options": "Panel Traces"
                    },
                    "properties": [
                      {
                        "id": "custom.cellOptions",
                        "value": {
                          "type": "data-links"
                        }
                      }
                    ]
                  },
                  {
                    "matcher": {
                      "id": "byName",
                      "scope": "series",
                      "options": "Explore Traces"
                    },
                    "properties": [
                      {
                        "id": "custom.cellOptions",
                        "value": {
                          "type": "data-links"
                        }
                      }
                    ]
                  }
                ]
              }
            }
          }
        }
      },
      "panel-2": {
        "kind": "Panel",
        "spec": {
          "id": 2,
          "title": "Traces",
          "description": "",
          "links": [],
          "data": {
            "kind": "QueryGroup",
            "spec": {
              "queries": [
                {
                  "kind": "PanelQuery",
                  "spec": {
                    "query": {
                      "kind": "DataQuery",
                      "group": "grafana-x-ray-datasource",
                      "version": "v0",
                      "datasource": {
                        "name": "dfjdcu10ysykgc"
                      },
                      "spec": {
                        "group": {
                          "GroupARN": "arn:aws:xray:us-east-1:587728158746:group/Default",
                          "GroupName": "Default",
                          "InsightsConfiguration": {
                            "InsightsEnabled": false,
                            "NotificationsEnabled": false
                          }
                        },
                        "query": "$traceId",
                        "queryMode": "X-Ray",
                        "queryType": "getTrace",
                        "region": "default"
                      }
                    },
                    "refId": "A",
                    "hidden": false
                  }
                }
              ],
              "transformations": [],
              "queryOptions": {}
            }
          },
          "vizConfig": {
            "kind": "VizConfig",
            "group": "table",
            "version": "13.1.0-24556818486",
            "spec": {
              "options": {
                "cellHeight": "sm",
                "showHeader": true
              },
              "fieldConfig": {
                "defaults": {
                  "thresholds": {
                    "mode": "absolute",
                    "steps": [
                      {
                        "value": 0,
                        "color": "green"
                      },
                      {
                        "value": 80,
                        "color": "red"
                      }
                    ]
                  },
                  "color": {
                    "mode": "thresholds"
                  },
                  "custom": {
                    "align": "auto",
                    "cellOptions": {
                      "type": "auto"
                    },
                    "footer": {
                      "reducers": []
                    },
                    "inspect": false
                  }
                },
                "overrides": [
                  {
                    "matcher": {
                      "id": "byName",
                      "options": "traceID"
                    },
                    "properties": [
                      {
                        "id": "custom.width",
                        "value": 323
                      }
                    ]
                  },
                  {
                    "matcher": {
                      "id": "byName",
                      "options": "serviceTags"
                    },
                    "properties": [
                      {
                        "id": "custom.width",
                        "value": 152
                      }
                    ]
                  }
                ]
              }
            }
          }
        }
      }
    },
    "layout": {
      "kind": "GridLayout",
      "spec": {
        "items": [
          {
            "kind": "GridLayoutItem",
            "spec": {
              "x": 0,
              "y": 0,
              "width": 24,
              "height": 12,
              "element": {
                "kind": "ElementReference",
                "name": "panel-1"
              }
            }
          },
          {
            "kind": "GridLayoutItem",
            "spec": {
              "x": 0,
              "y": 12,
              "width": 24,
              "height": 10,
              "element": {
                "kind": "ElementReference",
                "name": "panel-2"
              }
            }
          }
        ]
      }
    },
    "links": [],
    "liveNow": false,
    "preload": false,
    "tags": [],
    "timeSettings": {
      "timezone": "browser",
      "from": "now-6h",
      "to": "now",
      "autoRefresh": "1m",
      "autoRefreshIntervals": [
        "5s",
        "10s",
        "30s",
        "1m",
        "5m",
        "15m",
        "30m",
        "1h",
        "2h",
        "1d"
      ],
      "hideTimepicker": false,
      "fiscalYearStartMonth": 0
    },
    "title": "ICB Grafana Test Logs & Traces",
    "variables": [
      {
        "kind": "TextVariable",
        "spec": {
          "name": "search_text",
          "current": {
            "text": "",
            "value": ""
          },
          "query": "",
          "label": "Search Text",
          "hide": "dontHide",
          "skipUrlSync": false
        }
      },
      {
        "kind": "CustomVariable",
        "spec": {
          "name": "status_code",
          "query": "[{\"text\":\"N/A\",\"value\":\"!ispresent(statusCode)\"},{\"text\":\"1xx\",\"value\":\"statusCode >= 100 and statusCode < 200\"},{\"text\":\"2xx\",\"value\":\"statusCode >= 200 and statusCode < 300\"},{\"text\":\"3xx\",\"value\":\"statusCode >= 300 and statusCode < 400\"},{\"text\":\"4xx\",\"value\":\"statusCode >= 400 and statusCode < 500\"},{\"text\":\"5xx\",\"value\":\"statusCode >= 500 and statusCode < 600\"}]",
          "current": {
            "text": "2xx",
            "value": "statusCode >= 200 and statusCode < 300"
          },
          "options": [],
          "multi": false,
          "includeAll": false,
          "label": "Status Code",
          "hide": "dontHide",
          "skipUrlSync": false,
          "allowCustomValue": true,
          "valuesFormat": "json"
        }
      },
      {
        "kind": "CustomVariable",
        "spec": {
          "name": "log_level",
          "query": "[{\"text\":\"trace\",\"value\":\"logLevel = 'trace'\"},{\"text\":\"debug\",\"value\":\"logLevel = 'debug'\"},{\"text\":\"info\",\"value\":\"logLevel = 'info'\"},{\"text\":\"warn\",\"value\":\"logLevel = 'warn'\"},{\"text\":\"error\",\"value\":\"logLevel = 'error'\"},{\"text\":\"fatal\",\"value\":\"logLevel = 'fatal'\"}]",
          "current": {
            "text": "info",
            "value": "logLevel = 'info'"
          },
          "options": [],
          "multi": false,
          "includeAll": false,
          "label": "Log Level",
          "hide": "dontHide",
          "skipUrlSync": false,
          "allowCustomValue": true,
          "valuesFormat": "json"
        }
      },
      {
        "kind": "CustomVariable",
        "spec": {
          "name": "limit",
          "query": "[{\"text\":\"20\",\"value\":20},{\"text\":\"50\",\"value\":50},{\"text\":\"100\",\"value\":100},{\"text\":\"250\",\"value\":250},{\"text\":\"500\",\"value\":500},{\"text\":\"1000\",\"value\":1000}]",
          "current": {
            "text": "20",
            "value": "20"
          },
          "options": [],
          "multi": false,
          "includeAll": false,
          "label": "Limit",
          "hide": "dontHide",
          "skipUrlSync": false,
          "allowCustomValue": true,
          "valuesFormat": "json"
        }
      },
      {
        "kind": "TextVariable",
        "spec": {
          "name": "traceId",
          "current": {
            "text": "",
            "value": ""
          },
          "query": "",
          "label": "Trace Id",
          "hide": "hideVariable",
          "skipUrlSync": false
        }
      }
    ]
  }
}
