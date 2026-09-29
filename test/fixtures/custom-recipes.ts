// Real Cookidoo responses, from miaucl/cookidoo-api's docs/raw-api-requests
// (get-custom-recipes.txt and add-custom-recipe.txt), trimmed and without
// author ids. The API answers in two shapes; both must parse the same way.

/** GET created-recipes/{language}: structured objects, durations in seconds. */
export const LIST_RESPONSE = {
  "meta": {
    "recipeLimit": 150,
    "recipeLimitThreshold": 5
  },
  "items": [
    {
      "recipeId": "01K2CTJ9Y1BABRG5MXK44CFZS4",
      "status": "ACTIVE",
      "workStatus": "PRIVATE",
      "recipeContent": {
        "name": "Vongole alla marinara",
        "image": "https://assets.tmecosys.com/image/upload/{transformation}/img/recipe/ras/Assets/29F42E5A-098A-46BC-87C5-59CF7C81E44D/Derivates/43ADC698-B45F-41E2-A479-FA5BC32702C6",
        "isImageCopyrightOwned": true,
        "isBasedOn": "https://cookidoo.ch/recipes/recipe/en/r166987",
        "author": {
          "type": "ORGANIZATION",
          "name": "Vorwerk International & Co. KmG"
        },
        "prepTime": 600,
        "totalTime": 1800,
        "tools": [
          "TM7",
          "TM6",
          "TM5"
        ],
        "yield": {
          "value": 6,
          "unitText": "portion"
        },
        "ingredients": [
          {
            "type": "INGREDIENT",
            "text": "130 g di cipolla"
          },
          {
            "type": "INGREDIENT",
            "text": "1 ¼ - 2 ¼ spicchi di aglio"
          },
          {
            "type": "INGREDIENT",
            "text": "65 g di olio extravergine di oliva"
          },
          {
            "type": "INGREDIENT",
            "text": "1500 g di vongole fresche, pulite"
          },
          {
            "type": "INGREDIENT",
            "text": "1 pizzico di pepe macinato"
          },
          {
            "type": "INGREDIENT",
            "text": "65 g di vino bianco"
          },
          {
            "type": "INGREDIENT",
            "text": "190 g di brodo di pesce"
          },
          {
            "type": "INGREDIENT",
            "text": "2 ½ cucchiaini di prezzemolo fresco, tritato, sole le foglioline"
          },
          {
            "type": "INGREDIENT",
            "text": "1 ¼ cucchiaino di pangrattato"
          },
          {
            "type": "INGREDIENT",
            "text": "⅔ cucchiaino di sale"
          }
        ],
        "instructions": [
          {
            "type": "STEP",
            "text": "Mettere nel boccale le cipolle, gli spicchi di aglio e l’olio extravergine di oliva, tritare: 4 sec./vel. 5. Insaporire: 10 min./120°C/vel. 1. Nel frattempo, mettere le vongole nel Varoma e risciacquarle in acqua calda. Tenere da parte.",
            "annotations": [
              {
                "type": "INGREDIENT",
                "position": {
                  "offset": 23,
                  "length": 7
                },
                "data": {
                  "description": {
                    "text": "130 g di cipolla",
                    "annotations": [
                      {
                        "type": "VOLUME",
                        "position": {
                          "offset": 0,
                          "length": 5
                        },
                        "data": {
                          "amount": 130,
                          "unit": "g"
                        }
                      }
                    ]
                  }
                }
              },
              {
                "type": "INGREDIENT",
                "position": {
                  "offset": 36,
                  "length": 16
                },
                "data": {
                  "description": {
                    "text": "1 ¼ - 2 ¼ spicchi di aglio",
                    "annotations": [
                      {
                        "type": "VOLUME",
                        "position": {
                          "offset": 0,
                          "length": 9
                        },
                        "data": {
                          "amount": 1.25,
                          "amountMax": 2.25
                        }
                      }
                    ]
                  }
                }
              },
              {
                "type": "INGREDIENT",
                "position": {
                  "offset": 57,
                  "length": 26
                },
                "data": {
                  "description": {
                    "text": "65 g di olio extravergine di oliva",
                    "annotations": [
                      {
                        "type": "VOLUME",
                        "position": {
                          "offset": 0,
                          "length": 4
                        },
                        "data": {
                          "amount": 65,
                          "unit": "g"
                        }
                      }
                    ]
                  }
                }
              },
              {
                "type": "TTS",
                "position": {
                  "offset": 94,
                  "length": 13
                },
                "data": {
                  "speed": "5",
                  "time": 4
                }
              },
              {
                "type": "TTS",
                "position": {
                  "offset": 121,
                  "length": 20
                },
                "data": {
                  "speed": "1",
                  "time": 600,
                  "temperature": {
                    "value": "120",
                    "unit": "C"
                  }
                }
              },
              {
                "type": "INGREDIENT",
                "position": {
                  "offset": 169,
                  "length": 7
                },
                "data": {
                  "description": {
                    "text": "1500 g di vongole fresche, pulite",
                    "annotations": [
                      {
                        "type": "VOLUME",
                        "position": {
                          "offset": 0,
                          "length": 6
                        },
                        "data": {
                          "amount": 1500,
                          "unit": "g"
                        }
                      }
                    ]
                  }
                }
              }
            ],
            "missedUsages": []
          },
          {
            "type": "STEP",
            "text": "Aggiungere nel boccale il pepe, il vino bianco e il brodo. Posizionare il Varoma e cuocere a vapore: 14 min./Varoma/vel. 2.",
            "annotations": [
              {
                "type": "INGREDIENT",
                "position": {
                  "offset": 26,
                  "length": 4
                },
                "data": {
                  "description": {
                    "text": "1 pizzico di pepe macinato",
                    "annotations": [
                      {
                        "type": "VOLUME",
                        "position": {
                          "offset": 0,
                          "length": 9
                        },
                        "data": {
                          "amount": 1,
                          "unit": "pizzico"
                        }
                      }
                    ]
                  }
                }
              },
              {
                "type": "INGREDIENT",
                "position": {
                  "offset": 35,
                  "length": 11
                },
                "data": {
                  "description": {
                    "text": "65 g di vino bianco",
                    "annotations": [
                      {
                        "type": "VOLUME",
                        "position": {
                          "offset": 0,
                          "length": 4
                        },
                        "data": {
                          "amount": 65,
                          "unit": "g"
                        }
                      }
                    ]
                  }
                }
              },
              {
                "type": "INGREDIENT",
                "position": {
                  "offset": 52,
                  "length": 5
                },
                "data": {
                  "description": {
                    "text": "190 g di brodo di pesce",
                    "annotations": [
                      {
                        "type": "VOLUME",
                        "position": {
                          "offset": 0,
                          "length": 5
                        },
                        "data": {
                          "amount": 190,
                          "unit": "g"
                        }
                      }
                    ]
                  }
                }
              },
              {
                "type": "TTS",
                "position": {
                  "offset": 101,
                  "length": 21
                },
                "data": {
                  "speed": "2",
                  "time": 840,
                  "temperature": {
                    "value": "varoma"
                  }
                }
              }
            ],
            "missedUsages": []
          }
        ]
      }
    }
  ]
};

/** POST created-recipes/{language} (copy a recipe): schema.org-like shape, ISO 8601 durations. */
export const COPY_RESPONSE = {
  "recipeId": "01K2CTJ9Y1BABRG5MXK44CFZS4",
  "status": "ACTIVE",
  "workStatus": "PRIVATE",
  "recipeContent": {
    "name": "Vongole alla marinara",
    "image": "https://assets.tmecosys.com/image/upload/{transformation}/img/recipe/ras/Assets/29F42E5A-098A-46BC-87C5-59CF7C81E44D/Derivates/43ADC698-B45F-41E2-A479-FA5BC32702C6",
    "isBasedOn": "https://cookidoo.ch/recipes/recipe/en/r166987",
    "totalTime": "PT30M",
    "prepTime": "PT10M",
    "tool": [
      "TM7",
      "TM6",
      "TM5"
    ],
    "recipeYield": {
      "value": 6,
      "unitText": "portion"
    },
    "recipeIngredient": [
      "130 g di cipolla",
      "1 ¼ - 2 ¼ spicchi di aglio",
      "65 g di olio extravergine di oliva",
      "1500 g di vongole fresche, pulite",
      "1 pizzico di pepe macinato",
      "65 g di vino bianco",
      "190 g di brodo di pesce",
      "2 ½ cucchiaini di prezzemolo fresco, tritato, sole le foglioline",
      "1 ¼ cucchiaino di pangrattato",
      "⅔ cucchiaino di sale"
    ],
    "recipeInstructions": [
      "Mettere nel boccale le cipolle, gli spicchi di aglio e l’olio extravergine di oliva, tritare: 4 sec./vel. 5. Insaporire: 10 min./120°C/vel. 1. Nel frattempo, mettere le vongole nel Varoma e risciacquarle in acqua calda. Tenere da parte.",
      "Aggiungere nel boccale il pepe, il vino bianco e il brodo. Posizionare il Varoma e cuocere a vapore: 14 min./Varoma/vel. 2.",
      "Togliere il Varoma. Aggiungere i prezzemolo, il pangrattato e il sale, mescolare: 15 sec./vel. 2. Trasferire le vongole in un piatto da portata, versare sopra la salsa e spolverizzare con il prezzemolo. Servire subito."
    ]
  }
};
