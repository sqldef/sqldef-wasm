package main

import (
  "strings"
  "syscall/js"

  "github.com/sqldef/sqldef/database"
  "github.com/sqldef/sqldef/parser"
  "github.com/sqldef/sqldef/schema"
)

// diff takes SQL DDL statements and generates the difference
func diff(mode string, desiredDDLs string, currentDDLs string) (string, error) {
  generatorMode := schema.GeneratorModeMysql
  sqlParser := database.GenericParser{}
  
  if mode == "postgres" {
    generatorMode = schema.GeneratorModePostgres
    sqlParser = database.NewParser(parser.ParserModePostgres)
  }

  if mode == "sqlite3" {
    generatorMode = schema.GeneratorModeSQLite3
    sqlParser = database.NewParser(parser.ParserModeSQLite3)
  }

  if mode == "mssql" {
    generatorMode = schema.GeneratorModeMssql
    sqlParser = database.NewParser(parser.ParserModeMssql)
  }

  ddls, err := schema.GenerateIdempotentDDLs(generatorMode, sqlParser, desiredDDLs, currentDDLs, database.GeneratorConfig{}, "")
  out := strings.Join(ddls, ";\n")
  
  if err != nil {
    return "", err
  } else {
    return out, nil
  }
}

// diffWrapper creates a JS-compatible function for the diff operation
func diffWrapper() js.Func {
  return js.FuncOf(func(this js.Value, args []js.Value) interface{} {
    if len(args) != 3 {
      return map[string]interface{}{
        "error": "Invalid number of arguments. Expected 3: mode, desiredDDLs, currentDDLs",
      }
    }

    mode := args[0].String()
    desiredDDLs := args[1].String()
    currentDDLs := args[2].String()

    result, err := diff(mode, desiredDDLs, currentDDLs)
    if err != nil {
      return map[string]interface{}{
        "error": err.Error(),
      }
    }

    return map[string]interface{}{
      "result": result,
    }
  })
}

// createSqlDefModule creates an object with all exported functions
func createSqlDefModule() map[string]interface{} {
  return map[string]interface{}{
    "diff": diffWrapper(),
  }
}

// registerModuleFactory registers a function that returns the module
func registerModuleFactory() js.Func {
  moduleFactory := js.FuncOf(func(this js.Value, args []js.Value) interface{} {
    return createSqlDefModule()
  })
  
  js.Global().Set("createSqlDefModule", moduleFactory)
  return moduleFactory
}

func main() {
  moduleFactory := registerModuleFactory()
  <-make(chan bool)
  moduleFactory.Release()
}