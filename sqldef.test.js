import { test } from 'node:test'
import sqldef from './index.js'

test('should be able to diff some mysql', async ({ assert }) => {
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
  const r = await sqldef('mysql', sql1, sql2)
  assert.snapshot(r)
})

test('should be able to diff some mssql', async ({ assert }) => {
  const sql1 = `
  CREATE TABLE dbo.Employee (
    EmployeeID INT PRIMARY KEY
  );
  `

  const sql2 = `
  CREATE TABLE dbo.Employee (
    Employee INT PRIMARY KEY
  );
  `
  const r = await sqldef('mssql', sql1, sql2)
  assert.snapshot(r)
})

test('should be able to diff some sqlite', async ({ assert }) => {
  const sql1 = `
  CREATE TABLE IF NOT EXISTS user (
    id INT PRIMARY KEY
  );
  `

  const sql2 = `
  CREATE TABLE IF NOT EXISTS user (
    id INT PRIMARY KEY,
    name VARCHAR NOT NULL
  );
  `
  const r = await sqldef('sqlite3', sql1, sql2)
  assert.snapshot(r)
})

test('should be able to diff some postgres', async ({ assert }) => {
  const sql1 = `
  CREATE TABLE IF NOT EXISTS user (
    id INT PRIMARY KEY
  );
  `

  const sql2 = `
  CREATE TABLE IF NOT EXISTS user (
    id INT PRIMARY KEY,
    name VARCHAR NOT NULL,
    location point
  );
  `
  const r = await sqldef('postgres', sql1, sql2)
  assert.snapshot(r)
})

test('should throw on bad SQL', async ({ assert }) => {
  try {
    await sqldef('mysql', 'BAD STUFF', 'NOT SQL, SORRRY')
    assert.equal(true, 'Should have thrown')
  } catch (e) {
    assert.snapshot(e.message)
  }
})

test('should throw on bad type', async ({ assert }) => {
  const sql1 = `
  CREATE TABLE IF NOT EXISTS user (
    id INT PRIMARY KEY
  );
  `

  const sql2 = `
  CREATE TABLE IF NOT EXISTS user (
    id INT PRIMARY KEY,
    name VARCHAR NOT NULL
  );
  `
  try {
    await sqldef('sqlite', sql1, sql2)
    assert.equal(true, 'Should have thrown')
  } catch (e) {
    assert.snapshot(e.message)
  }
})
