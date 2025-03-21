This is a wasm-compiled version of [sqldef](https://github.com/sqldef/sqldef) for easy use in JS.

## usage

### CLI

I made a node-based CLI wrapper:

```bash
npx -y sqldef@latest --help
```

If you want to install it globally:

```bash
npm i -g sqldef@latest
sqldef --help
```

I recommend using the [upstream CLI](https://github.com/sqldef/sqldef), though, if you are not using nodejs for other things.


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

// this will tell you the SQL needed to change sql1 into sql2
const output = await sqldef('mysql', sql1, sql2)
```

Supported types: `mysql`, `sqlite3`, `mssql`, `postgres`.

For node specifically, you can also use a wrapper I made to do real database operations:

```js
import sqldef from 'sqldef'
import {getStructure, executeQuery} from 'sqldef/db'
import { readFile } from 'node:fs/promises'

const db = {type, host, database, user, password, socket, port }
const current = await getStructure(db)
const newStruct = await readFile('db.sql', 'utf8')
const diff = await sqldef(db.type, current, newStruct)
console.log(diff)
if (diff.trim()) {
  await executeQuery({query: diff, ...db})
}
```

### web

```html
<script type="module">
import sqldef from 'https://sqldef.github.io/sqldef-wasm/sqldef/index.js'

const output = await sqldef('mysql', sql1, sql2)
</script>
```


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
