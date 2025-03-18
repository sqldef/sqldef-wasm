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
  assert.equal(r, 'ALTER TABLE `user` DROP COLUMN `created_at`')
})

test('should throw on bad SQL', async ({assert}) => {
  try {
    await sqldef('mysql', 'BAD STUFF', 'NOT SQL, SORRRY')
    assert.equal(true, 'Should have thrown')
  } catch(e) {
    assert.equal(true, e.message.includes('found syntax error when parsing DDL'), `Error is not correct: ${e.message}`)
  }
})