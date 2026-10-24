CREATE TABLE IF NOT EXISTS coin_wallets (
 user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
 earned_total integer NOT NULL DEFAULT 0,
 spent_total integer NOT NULL DEFAULT 0,
 xp integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS coin_ledger (
 id bigserial PRIMARY KEY,
 user_id bigint NOT NULL REFERENCES users(id),
 amount integer NOT NULL CHECK (amount <> 0),
 kind varchar(40) NOT NULL,
 reference varchar(180) NOT NULL,
 counterparty_user_id bigint REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id, reference)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS coin_ledger_user_created_idx ON coin_ledger(user_id,created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS coin_transfers (
 id bigserial PRIMARY KEY,
 sender_id bigint NOT NULL REFERENCES users(id),
 recipient_id bigint NOT NULL REFERENCES users(id),
 amount integer NOT NULL CHECK(amount BETWEEN 10 AND 100),
 note varchar(140),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(sender_id <> recipient_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS coin_transfers_sender_created_idx ON coin_transfers(sender_id,created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS coin_products (
 id bigserial PRIMARY KEY,
 title varchar(160) NOT NULL,
 description varchar(500) NOT NULL DEFAULT '',
 kind varchar(24) NOT NULL CHECK(kind IN ('virtual','real')),
 price integer NOT NULL CHECK(price > 0),
 stock integer CHECK(stock IS NULL OR stock >= 0),
 active boolean NOT NULL DEFAULT true,
 min_earned_percent integer NOT NULL DEFAULT 0 CHECK(min_earned_percent BETWEEN 0 AND 100),
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS coin_orders (
 id bigserial PRIMARY KEY,
 user_id bigint NOT NULL REFERENCES users(id),
 product_id bigint NOT NULL REFERENCES coin_products(id),
 price integer NOT NULL,
 status varchar(24) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','fulfilled','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS coin_challenges (
 id bigserial PRIMARY KEY,
 title varchar(160) NOT NULL,
 description varchar(500) NOT NULL DEFAULT '',
 competition_id bigint NOT NULL REFERENCES competitions(id),
 start_date date NOT NULL,
 end_date date NOT NULL,
 required_days integer NOT NULL CHECK(required_days > 0),
 reward integer NOT NULL CHECK(reward >= 0),
 active boolean NOT NULL DEFAULT true,
 CHECK(end_date >= start_date)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS coin_challenge_members (
 challenge_id bigint NOT NULL REFERENCES coin_challenges(id),
 user_id bigint NOT NULL REFERENCES users(id),
 joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(challenge_id,user_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS coin_team_funds (
 id bigserial PRIMARY KEY,
 title varchar(160) NOT NULL,
 goal integer NOT NULL CHECK(goal > 0),
 balance integer NOT NULL DEFAULT 0 CHECK(balance >= 0),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS coin_team_contributions (
 id bigserial PRIMARY KEY,
 fund_id bigint NOT NULL REFERENCES coin_team_funds(id),
 user_id bigint NOT NULL REFERENCES users(id),
 amount integer NOT NULL CHECK(amount > 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO coin_products(title,description,kind,price,stock,min_earned_percent)
SELECT 'Золотая рамка','Украшение профиля на 30 дней','virtual',150,NULL,0
WHERE NOT EXISTS(SELECT 1 FROM coin_products WHERE title='Золотая рамка');
--> statement-breakpoint
INSERT INTO coin_products(title,description,kind,price,stock,min_earned_percent)
SELECT 'Легенда GOSUP','Коллекционный титул','virtual',500,NULL,0
WHERE NOT EXISTS(SELECT 1 FROM coin_products WHERE title='Легенда GOSUP');