CREATE TABLE IF NOT EXISTS "users" (
  "user_id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "username" VARCHAR(50) NOT NULL,
  "email" VARCHAR(100) NOT NULL,
  "first_name" VARCHAR(50) NOT NULL,
  "last_name" VARCHAR(50) NOT NULL,
  "date_of_birth" DATE,
  "registration_date" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "active" BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS "jobs" (
  "job_id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "company_name" VARCHAR(100) NOT NULL,
  "job_title" VARCHAR(100) NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "is_current_job" BOOLEAN DEFAULT FALSE,
  "salary" DECIMAL(10, 2),
  FOREIGN KEY ("user_id") REFERENCES "users" ("user_id")
);

CREATE TABLE IF NOT EXISTS "hobbies" (
  "hobby_id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "hobby_name" VARCHAR(100) NOT NULL,
  "skill_level" VARCHAR(20),
  "years_of_experience" INTEGER,
  "date_added" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("user_id") REFERENCES "users" ("user_id")
);
