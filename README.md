This is a wasm-compiled version of [sqldef](https://github.com/sqldef/sqldef) for easy use in JS.

## usage

### node/bun/etc

```bash
npm i sqldef
```

```js
import sqldef from 'sqldef'

const sql1 = `
CREATE TABLE user (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) DEFAULT 'konsumer'
) Engine=InnoDB DEFAULT CHARSET=utf8mb4;
`

const sql2 = `
CREATE TABLE user (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) DEFAULT 'konsumer',
  created_at DATETIME NOT NULL
) Engine=InnoDB DEFAULT CHARSET=utf8mb4;
`

const output = await sqldef('mysql', sql1, sql2)
```

Supported types: `mysql`, `sqlite3`, `mssql`, `postgres`.

### development

Normally, you should not need to do this stuff, but for local dev:

```bash
# build wasm
npm run build

# start a watching local web-server
# /sqldef is aliased to root-dir
npm start

# run all unit-tests
npm t

# use the CLI
sqlite3 test.sqlite < test/sqlite3.sql
./cli.mjs import -f test/sqlite3.sql -t sqlite3 -h test.sqlite
```
