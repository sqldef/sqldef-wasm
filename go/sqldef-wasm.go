package main

import (
	"fmt"
	"strings"
	"syscall/js"

	"github.com/sqldef/sqldef/database"
	"github.com/sqldef/sqldef/parser"
	"github.com/sqldef/sqldef/schema"
)

// diff takes SQL DDL statements and generates the difference
func diff(mode string, desiredDDLs string, currentDDLs string) (string, error) {
	var generatorMode schema.GeneratorMode
	var sqlParser database.Parser

	switch mode {
	case "postgres":
		generatorMode = schema.GeneratorModePostgres
		sqlParser = database.NewParser(parser.ParserModePostgres)
	case "sqlite3":
		generatorMode = schema.GeneratorModeSQLite3
		sqlParser = database.NewParser(parser.ParserModeSQLite3)
	case "mssql":
		generatorMode = schema.GeneratorModeMssql
		sqlParser = database.NewParser(parser.ParserModeMssql)
	case "mysql":
		generatorMode = schema.GeneratorModeMysql
		sqlParser = database.GenericParser{}
	default:
		return "", fmt.Errorf("Invalid type: %s. Use mysql/sqlite3/mssql/postgres", mode)
	}

	ddls, err := schema.GenerateIdempotentDDLs(generatorMode, sqlParser, desiredDDLs, currentDDLs, database.GeneratorConfig{}, "")
	if err != nil {
		return "", err
	}

	return strings.Join(ddls, ";\n"), nil
}

func jsDiff(this js.Value, args []js.Value) interface{} {
	if len(args) != 3 {
		return map[string]interface{}{
			"error": "Invalid number of arguments. Expected 3: mode, desiredDDLs, currentDDLs",
		}
	}
	result, err := diff(args[0].String(), args[1].String(), args[2].String())
	if err != nil {
		return map[string]interface{}{
			"error": err.Error(),
		}
	}
	return map[string]interface{}{
		"result": result,
	}
}

func main() {
	module := map[string]interface{}{
		"diff": js.FuncOf(jsDiff),
	}
	js.Global().Set("createSqlDefModule", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		return module
	}))
	<-make(chan bool)
}
