// cross-database way to get structure of current database and run any query

/**
 * Get SQL to create all tables in a database
 *
 * @param {Object} config - Database connection configuration
 * @param {string} config.host - Database host (or filename for SQLite)
 * @param {string} config.database - Database name
 * @param {string} config.user - Database user
 * @param {string} config.password - Database password
 * @param {string} [config.socket] - Database socket
 * @param {number} [config.port] - Database port
 * @returns {Promise<string>} SQL statements to create all tables
 */
export async function getStructure({ host, database, user, password, socket, port }) {
  // Determine database type based on which module we're going to use
  let dbType, connection, sql

  // Check if host is a file path (SQLite)
  if (host && host.includes('.') && !host.includes(':')) {
    dbType = 'sqlite3'

    // Connect to SQLite database
    const { default: Database } = await import('better-sqlite3')
    const db = new Database(host)

    try {
      // Get all tables
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()

      // Generate CREATE TABLE statements for each table
      sql = await Promise.all(
        tables.map(async (table) => {
          const tableName = table.name
          const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()

          // Build column definitions
          const columnDefinitions = columns
            .map((col) => {
              let def = `"${col.name}" ${col.type}`

              if (col.notnull) {
                def += ' NOT NULL'
              }

              if (col.dflt_value !== null) {
                def += ` DEFAULT ${col.dflt_value}`
              }

              if (col.pk) {
                def += ' PRIMARY KEY'
                if (col.type.toUpperCase() === 'INTEGER') {
                  def += ' AUTOINCREMENT'
                }
              }

              return def
            })
            .join(',\n  ')

          // Get foreign keys
          const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${tableName})`).all()
          let constraintDefinitions = ''

          if (foreignKeys.length > 0) {
            constraintDefinitions =
              ',\n  ' +
              foreignKeys
                .map((fk) => {
                  return `FOREIGN KEY ("${fk.from}") REFERENCES "${fk.table}" ("${fk.to}")`
                })
                .join(',\n  ')
          }

          return `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${columnDefinitions}${constraintDefinitions}\n);`
        })
      )

      return sql.join('\n\n')
    } finally {
      db.close()
    }
  } else if (host) {
    // Try to determine database type based on port if not specified
    if (!port) {
      port = 3306 // Default to MySQL port
    }

    switch (port.toString()) {
      case '3306':
        dbType = 'mysql'
        break
      case '5432':
        dbType = 'postgres'
        break
      case '1433':
        dbType = 'mssql'
        break
      default:
        dbType = 'mysql' // Default to MySQL
    }

    if (dbType === 'mysql') {
      const mysql = await import('mysql')

      return new Promise((resolve, reject) => {
        const conn = mysql.default.createConnection({
          host,
          user,
          password,
          database,
          port,
          socketPath: socket
        })

        conn.connect((err) => {
          if (err) {
            conn.end()
            return reject(err)
          }

          // Get all tables
          conn.query(`SHOW TABLES`, (err, tables) => {
            if (err) {
              conn.end()
              return reject(err)
            }

            const tableNames = tables.map((table) => Object.values(table)[0])
            let completed = 0
            const tableDefinitions = []

            // If no tables, return empty string
            if (tableNames.length === 0) {
              conn.end()
              return resolve('')
            }

            // Get CREATE TABLE statement for each table
            tableNames.forEach((tableName) => {
              conn.query(`SHOW CREATE TABLE \`${tableName}\``, (err, result) => {
                if (err) {
                  conn.end()
                  return reject(err)
                }

                const createStatement = result[0]['Create Table']
                tableDefinitions.push(createStatement + ';')

                completed++
                if (completed === tableNames.length) {
                  conn.end()
                  resolve(tableDefinitions.join('\n\n'))
                }
              })
            })
          })
        })
      })
    } else if (dbType === 'postgres') {
      const { Client } = await import('pg')

      const client = new Client({
        host,
        user,
        password,
        database,
        port: port || 5432
      })

      try {
        await client.connect()

        // Get all tables in public schema
        const tableResult = await client.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        `)

        const tableNames = tableResult.rows.map((row) => row.table_name)

        // Generate CREATE TABLE statements
        const tableDefinitions = await Promise.all(
          tableNames.map(async (tableName) => {
            // Get column information
            const columnResult = await client.query(
              `
            SELECT column_name, data_type, character_maximum_length, is_nullable, column_default,
                   is_identity, identity_generation
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position
          `,
              [tableName]
            )

            // Get primary key information
            const pkResult = await client.query(
              `
            SELECT c.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.constraint_column_usage AS ccu USING (constraint_schema, constraint_name)
            JOIN information_schema.columns AS c ON c.table_schema = tc.constraint_schema
              AND c.table_name = tc.table_name AND c.column_name = ccu.column_name
            WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1
          `,
              [tableName]
            )

            const pkColumns = pkResult.rows.map((row) => row.column_name)

            // Build column definitions
            const columnDefinitions = columnResult.rows
              .map((col) => {
                let dataType = col.data_type
                if (col.character_maximum_length) {
                  dataType += `(${col.character_maximum_length})`
                }

                let def = `"${col.column_name}" ${dataType}`

                if (col.is_identity === 'YES') {
                  if (col.identity_generation === 'BY DEFAULT') {
                    def += ' GENERATED BY DEFAULT AS IDENTITY'
                  } else {
                    def += ' GENERATED ALWAYS AS IDENTITY'
                  }
                }

                if (col.is_nullable === 'NO') {
                  def += ' NOT NULL'
                }

                if (col.column_default !== null && !col.column_default.includes('nextval')) {
                  def += ` DEFAULT ${col.column_default}`
                }

                return def
              })
              .join(',\n  ')

            // Add primary key constraint
            let constraints = ''
            if (pkColumns.length > 0) {
              constraints += `,\n  PRIMARY KEY (${pkColumns.map((col) => `"${col}"`).join(', ')})`
            }

            // Get foreign key constraints
            const fkResult = await client.query(
              `
            SELECT
              kcu.column_name,
              ccu.table_name AS foreign_table_name,
              ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1
          `,
              [tableName]
            )

            if (fkResult.rows.length > 0) {
              for (const fk of fkResult.rows) {
                constraints += `,\n  FOREIGN KEY ("${fk.column_name}") REFERENCES "${fk.foreign_table_name}" ("${fk.foreign_column_name}")`
              }
            }

            return `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${columnDefinitions}${constraints}\n);`
          })
        )

        return tableDefinitions.join('\n\n')
      } finally {
        await client.end()
      }
    } else if (dbType === 'mssql') {
      const { Connection, Request } = await import('tedious')

      return new Promise((resolve, reject) => {
        const config = {
          server: host,
          authentication: {
            type: 'default',
            options: {
              userName: user,
              password: password
            }
          },
          options: {
            database: database,
            port: port || 1433,
            trustServerCertificate: true
          }
        }

        const connection = new Connection(config)

        connection.on('connect', (err) => {
          if (err) {
            return reject(err)
          }

          const tableDefinitions = []

          // Get all tables
          const request = new Request(
            `
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_CATALOG = '${database}'
          `,
            (err, rowCount, rows) => {
              if (err) {
                connection.close()
                return reject(err)
              }

              if (rowCount === 0) {
                connection.close()
                return resolve('')
              }

              const tableNames = rows.map((row) => row[0].value)
              let completed = 0

              // For each table, get its definition
              tableNames.forEach((tableName) => {
                const scriptRequest = new Request(
                  `
                DECLARE @schema_name NVARCHAR(100)
                SET @schema_name = OBJECT_SCHEMA_NAME(OBJECT_ID('${tableName}'))

                DECLARE @SQL NVARCHAR(MAX) = ''

                -- Start CREATE TABLE statement
                SET @SQL = 'CREATE TABLE [' + @schema_name + '].[${tableName}] (' + CHAR(13) + CHAR(10)

                -- Add column definitions
                SELECT @SQL = @SQL + '  [' + c.name + '] ' +
                  CASE WHEN t.name = 'nvarchar' OR t.name = 'varchar' OR t.name = 'nchar' OR t.name = 'char'
                      THEN t.name + '(' +
                          CASE WHEN c.max_length = -1
                              THEN 'MAX'
                              ELSE
                                  CASE WHEN t.name = 'nvarchar' OR t.name = 'nchar'
                                      THEN CAST(c.max_length/2 AS VARCHAR(10))
                                      ELSE CAST(c.max_length AS VARCHAR(10))
                                  END
                          END + ')'
                      WHEN t.name = 'decimal' OR t.name = 'numeric'
                          THEN t.name + '(' + CAST(c.precision AS VARCHAR(10)) + ', ' + CAST(c.scale AS VARCHAR(10)) + ')'
                      ELSE t.name
                  END + ' ' +
                  CASE WHEN c.is_identity = 1
                      THEN 'IDENTITY(' + CAST(IDENT_SEED(QUOTENAME(@schema_name) + '.' + QUOTENAME('${tableName}')) AS VARCHAR(10)) + ',' +
                           CAST(IDENT_INCR(QUOTENAME(@schema_name) + '.' + QUOTENAME('${tableName}')) AS VARCHAR(10)) + ') '
                      ELSE ''
                  END +
                  CASE WHEN c.is_nullable = 0
                      THEN 'NOT NULL'
                      ELSE 'NULL'
                  END +
                  CASE WHEN dc.definition IS NOT NULL
                      THEN ' DEFAULT ' + dc.definition
                      ELSE ''
                  END + ',' + CHAR(13) + CHAR(10)
                FROM sys.columns c
                JOIN sys.types t ON c.user_type_id = t.user_type_id
                LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
                WHERE c.object_id = OBJECT_ID('${tableName}')
                ORDER BY c.column_id

                -- Add primary key constraint
                SELECT @SQL = @SQL + '  CONSTRAINT [' + k.name + '] PRIMARY KEY ' +
                  CASE WHEN i.type = 1 THEN 'CLUSTERED' ELSE 'NONCLUSTERED' END +
                  ' (' +
                  STUFF((
                    SELECT ', [' + c.name + ']' +
                      CASE WHEN ic.is_descending_key = 1 THEN ' DESC' ELSE ' ASC' END
                    FROM sys.index_columns ic
                    JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    WHERE ic.object_id = k.parent_object_id AND ic.index_id = k.unique_index_id
                    ORDER BY ic.key_ordinal
                    FOR XML PATH('')
                  ), 1, 2, '') +
                  '),' + CHAR(13) + CHAR(10)
                FROM sys.key_constraints k
                JOIN sys.indexes i ON k.parent_object_id = i.object_id AND k.unique_index_id = i.index_id
                WHERE k.parent_object_id = OBJECT_ID('${tableName}') AND k.type = 'PK'

                -- Add foreign key constraints
                SELECT @SQL = @SQL + '  CONSTRAINT [' + fk.name + '] FOREIGN KEY (' +
                  STUFF((
                    SELECT ', [' + c.name + ']'
                    FROM sys.foreign_key_columns fkc
                    JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
                    WHERE fkc.constraint_object_id = fk.object_id
                    ORDER BY fkc.constraint_column_id
                    FOR XML PATH('')
                  ), 1, 2, '') +
                  ') REFERENCES [' + OBJECT_SCHEMA_NAME(fk.referenced_object_id) + '].[' +
                  OBJECT_NAME(fk.referenced_object_id) + '] (' +
                  STUFF((
                    SELECT ', [' + c.name + ']'
                    FROM sys.foreign_key_columns fkc
                    JOIN sys.columns c ON fkc.referenced_object_id = c.object_id AND fkc.referenced_column_id = c.column_id
                    WHERE fkc.constraint_object_id = fk.object_id
                    ORDER BY fkc.constraint_column_id
                    FOR XML PATH('')
                  ), 1, 2, '') +
                  '),' + CHAR(13) + CHAR(10)
                FROM sys.foreign_keys fk
                WHERE fk.parent_object_id = OBJECT_ID('${tableName}')

                -- Remove the last comma and add closing parenthesis
                SET @SQL = LEFT(@SQL, LEN(@SQL) - 3) + CHAR(13) + CHAR(10) + ');' + CHAR(13) + CHAR(10)

                SELECT @SQL AS CreateTableStatement
              `,
                  (err, rowCount, rows) => {
                    if (err) {
                      connection.close()
                      return reject(err)
                    }

                    if (rowCount > 0 && rows[0][0].value) {
                      tableDefinitions.push(rows[0][0].value)
                    }

                    completed++
                    if (completed === tableNames.length) {
                      connection.close()
                      resolve(tableDefinitions.join('\n\n'))
                    }
                  }
                )

                connection.execSql(scriptRequest)
              })
            }
          )

          connection.execSql(request)
        })

        connection.connect()
      })
    }
  }

  throw new Error('Could not determine database type or unsupported database type')
}

/**
 * Execute SQL query on different database types
 *
 * @param {Object} config - Database connection configuration
 * @param {string} config.host - Database host (or filename for SQLite)
 * @param {string} config.database - Database name (not used for SQLite)
 * @param {string} config.user - Database user (not used for SQLite)
 * @param {string} config.password - Database password (not used for SQLite)
 * @param {string} [config.socket] - Database socket (MySQL only)
 * @param {number} [config.port] - Database port
 * @param {string} config.query - SQL query to execute
 * @param {Array} [config.params] - Parameters for prepared statement
 * @returns {Promise<Object>} Query results
 */
export async function executeQuery({ host, database, user, password, socket, port, query, params = [] }) {
  // Determine database type based on the host or port
  let dbType

  // Check if host is a file path (SQLite)
  if (host && host.includes('.') && !host.includes(':')) {
    dbType = 'sqlite3'

    // Connect to SQLite database
    const { default: Database } = await import('better-sqlite3')
    const db = new Database(host)

    try {
      // Execute the query with parameters
      const statement = db.prepare(query)

      // Check if it's a SELECT query or similar (returns rows)
      if (/^\s*(SELECT|PRAGMA|WITH|EXPLAIN|DESCRIBE)/i.test(query)) {
        let result
        if (params.length > 0) {
          result = statement.all(...params)
        } else {
          result = statement.all()
        }
        return { rows: result, rowCount: result.length }
      } else {
        // For INSERT, UPDATE, DELETE, etc.
        let result
        if (params.length > 0) {
          result = statement.run(...params)
        } else {
          result = statement.run()
        }
        return {
          rowCount: result.changes,
          lastInsertRowid: result.lastInsertRowid
        }
      }
    } finally {
      db.close()
    }
  } else if (host) {
    // Try to determine database type based on port if not specified
    if (!port) {
      port = 3306 // Default to MySQL port
    }

    switch (port.toString()) {
      case '3306':
        dbType = 'mysql'
        break
      case '5432':
        dbType = 'postgres'
        break
      case '1433':
        dbType = 'mssql'
        break
      default:
        dbType = 'mysql' // Default to MySQL
    }

    if (dbType === 'mysql') {
      const mysql = await import('mysql')

      return new Promise((resolve, reject) => {
        const conn = mysql.default.createConnection({
          host,
          user,
          password,
          database,
          port,
          socketPath: socket
        })

        conn.connect((err) => {
          if (err) {
            conn.end()
            return reject(err)
          }

          // Execute the query with parameters
          conn.query(query, params, (err, results, fields) => {
            conn.end()

            if (err) {
              return reject(err)
            }

            // Determine if it was a SELECT query by checking if results is an array
            if (Array.isArray(results)) {
              resolve({
                rows: results,
                rowCount: results.length,
                fields
              })
            } else {
              // For INSERT, UPDATE, DELETE, etc.
              resolve({
                rowCount: results.affectedRows,
                insertId: results.insertId,
                changedRows: results.changedRows
              })
            }
          })
        })
      })
    } else if (dbType === 'postgres') {
      const { Client } = await import('pg')

      const client = new Client({
        host,
        user,
        password,
        database,
        port: port || 5432
      })

      try {
        await client.connect()

        // Execute the query with parameters
        const result = await client.query(query, params)

        return {
          rows: result.rows,
          rowCount: result.rowCount,
          fields: result.fields
        }
      } finally {
        await client.end()
      }
    } else if (dbType === 'mssql') {
      const { Connection, Request, TYPES } = await import('tedious')

      // Map JavaScript parameter types to MSSQL parameter types
      function mapParamType(param) {
        if (param === null || param === undefined) {
          return TYPES.NVarChar
        }

        switch (typeof param) {
          case 'string':
            return TYPES.NVarChar
          case 'number':
            return Number.isInteger(param) ? TYPES.Int : TYPES.Float
          case 'boolean':
            return TYPES.Bit
          case 'object':
            if (param instanceof Date) {
              return TYPES.DateTime
            } else if (Buffer.isBuffer(param)) {
              return TYPES.VarBinary
            }
            return TYPES.NVarChar
          default:
            return TYPES.NVarChar
        }
      }

      return new Promise((resolve, reject) => {
        const config = {
          server: host,
          authentication: {
            type: 'default',
            options: {
              userName: user,
              password: password
            }
          },
          options: {
            database: database,
            port: port || 1433,
            trustServerCertificate: true
          }
        }

        const connection = new Connection(config)

        connection.on('connect', (err) => {
          if (err) {
            return reject(err)
          }

          const rows = []
          const fields = []

          // Create a request with the query
          const request = new Request(query, (err, rowCount) => {
            connection.close()

            if (err) {
              return reject(err)
            }

            // Determine if it was a SELECT query by checking if we have rows
            if (rows.length > 0 || (rowCount === 0 && fields.length > 0)) {
              resolve({
                rows,
                rowCount,
                fields
              })
            } else {
              // For INSERT, UPDATE, DELETE, etc.
              resolve({
                rowCount
              })
            }
          })

          // Add parameters to the request
          params.forEach((param, index) => {
            request.addParameter(`param${index}`, mapParamType(param), param)
          })

          // Capture field metadata
          request.on('columnMetadata', (columns) => {
            columns.forEach((column) => {
              fields.push({
                name: column.colName,
                type: column.type.name
              })
            })
          })

          // Capture rows
          request.on('row', (columns) => {
            const row = {}
            columns.forEach((column) => {
              row[column.metadata.colName] = column.value
            })
            rows.push(row)
          })

          // Execute the query
          connection.execSql(request)
        })

        connection.connect()
      })
    }
  }

  throw new Error('Could not determine database type or unsupported database type')
}
