#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import yargs from 'yargs/yargs'
import { hideBin } from 'yargs/helpers'
import { cosmiconfig } from 'cosmiconfig'
import Confirm from 'prompt-confirm'
import sqldef from './src/index.js'
import { getStructure, executeQuery } from './src/db.js'

// get a reasonable port
const getPort = (args) => {
  if (args.port) {
    return args.port
  }
  switch (args.type) {
    case 'mysql':
      return 3306
    case 'postgres':
      return 5432
    case 'mssql':
      return 1433
  }
}

// export the current database as a file
async function handleExport({ file, type, host, database, user, password, socket, port }) {
  const current = await getStructure({ type, host, database, user, password, socket, port })
  await writeFile(file, current)
}

// import database from file (using diff)
async function handleImport({ newStruct, type, host, database, user, password, socket, port, dry = false }) {
  const current = await getStructure({ type, host, database, user, password, socket, port })
  const diff = await sqldef(type, current, newStruct)
  if (!diff.trim()) {
    return ''
  }
  if (dry) {
    return diff
  }
  await executeQuery({ host, database, user, password, socket, port, query: diff })
}

const explorer = cosmiconfig('sqldef')
const r = (await explorer.search()) || { config: {} }
const { config = {} } = r
yargs(hideBin(process.argv))
  .demandCommand(1, 'You need to use a command (import/export)')
  .usage('Usage: $0 <command> [options]')
  .help('?')
  .alias('?', 'help')

  .alias('v', 'version')
  .example('$0 export', 'Save your current schema, from your mysql database, in schema.sql')
  .example('$0 import', 'Update your database to match schema.sql')

  .command(
    'export',
    'Export your database to a file',
    (a) => {},
    async (args) => {
      args.port = args.port || getPort(args)

      const { file, type, host, database, user, password, socket, port = getPort(args) } = args
      await handleExport({ file, type, host, database, user, password, socket, port, ...config })
    }
  )

  .command(
    'import',
    'Import your database from a file',
    (a) => {},
    async (args) => {
      const { file, type, host, database, user, password, socket, noConfirm, port = getPort(args) } = args
      const newStruct = await readFile(file, 'utf8')
      if (!noConfirm) {
        await handleImport({ newStruct, type, host, database, user, password, socket, port, ...config, dry: true })
        const prompt = new Confirm('Do you want to run this?')
        if (!(await prompt.run())) {
          console.error('Export canceled.')
          process.exit(1)
        }
      }
      await handleImport({ newStruct, type, host, database, user, password, socket, port, ...config, dry: false })
    }
  )

  .option('f', {
    alias: 'file',
    describe: 'The schema file to import/export',
    nargs: 1,
    default: config.file || 'schema.sql'
  })

  .option('t', {
    alias: 'type',
    describe: 'The type of the database',
    nargs: 1,
    choices: ['mysql', 'sqlite3', 'mssql', 'postgres'],
    default: config.type || 'mysql'
  })

  .option('h', {
    alias: 'host',
    describe: 'The host (or filename for sqlite) of the database',
    nargs: 1,
    default: config.host || 'localhost'
  })

  .option('d', {
    alias: 'database',
    describe: 'The name of the database',
    nargs: 1,
    default: config.database || 'test'
  })

  .option('u', {
    alias: 'user',
    describe: 'The user of the database',
    nargs: 1,
    default: config.user || 'root'
  })

  .option('P', {
    alias: 'password',
    describe: 'The password for the database',
    nargs: 1,
    default: config.password || ''
  })

  .option('p', {
    alias: 'port',
    describe: 'The port of the database',
    nargs: 1,
    default: config.port
  })

  .option('s', {
    alias: 'socket',
    describe: 'The socket of the database (only for mysql)',
    nargs: 1,
    default: config.socket
  })

  .option('x', {
    alias: 'no-confirm',
    describe: "Don't confirm before running the import",
    type: 'boolean',
    default: config['no-confirm']
  }).argv
