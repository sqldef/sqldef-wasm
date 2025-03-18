This is a wasm-compiled version of [sqldef](https://github.com/sqldef/sqldef) for easy use in JS.

## usage

### node/bun/etc

```bash
npm i sqldef
```

```js
import sqldef from sqldef

const output = await (sqldef({
  type,         // the type of your database ("mysql" or "postgres")
  database,     // the name of your database
  user,         // the username of your database
  password,     // the password of your database
  host,         // the hostname of your database
  port,         // the port of your database
  socket,       // the unix socket (for mysql)
  file,         // the schema file to read/write
  dry: true,    // dry run - don't do anything to the database
  get: true     // get the current definition from database
}))
```

_TODO_: notes about web

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
```
