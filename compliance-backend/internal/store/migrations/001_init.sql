-- Evidence tables are append-only (design D8): rows are never edited, a new row or version is added instead.

CREATE TABLE chain_cursor (
    chain_id        bigint PRIMARY KEY,
    last_reconciled bigint NOT NULL,
    backfill_until  bigint NOT NULL DEFAULT 0
);

CREATE TABLE payment (
    id             bytea PRIMARY KEY,               -- keccak256(abi.encode(chainId, txHash, logIndex))
    chain_id       bigint NOT NULL,
    tx_hash        bytea NOT NULL,
    log_index      bigint NOT NULL,
    block_number   bigint NOT NULL,
    block_hash     bytea NOT NULL,
    block_time     timestamptz NOT NULL,
    token          bytea NOT NULL,
    payer          bytea NOT NULL,
    deposit        bytea NOT NULL,
    amount         numeric(78, 0) NOT NULL,
    ingest         text NOT NULL CHECK (ingest IN ('seen', 'confirmed', 'orphaned')),
    stage          text NOT NULL DEFAULT 'checks_pending'
                   CHECK (stage IN ('checks_pending', 'checks_done', 'in_review', 'decided')),
    reconstruction boolean NOT NULL DEFAULT false,
    first_seen_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (chain_id, tx_hash, log_index)
);
CREATE INDEX payment_payer_time ON payment (payer, block_time) WHERE ingest = 'confirmed';
CREATE INDEX payment_stage ON payment (stage, ingest);

CREATE TABLE sanctions_list_version (
    id        bigserial PRIMARY KEY,
    name      text NOT NULL,
    version   text NOT NULL,
    sha256    text NOT NULL,
    entries   integer NOT NULL,
    loaded_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (name, version, sha256)
);

CREATE TABLE check_result (
    id           bigserial PRIMARY KEY,
    payment_id   bytea NOT NULL REFERENCES payment (id),
    kind         text NOT NULL CHECK (kind IN ('kyt', 'sanctions', 'structuring', 'issuer')),
    provider     text NOT NULL,
    product      text NOT NULL,
    outcome      text NOT NULL,
    result       jsonb NOT NULL,                    -- the normalised pack section
    raw_sha256   text,
    performed_at timestamptz NOT NULL,
    UNIQUE (payment_id, kind)
);

CREATE TABLE ruleset (
    version        text PRIMARY KEY,
    canonical      text NOT NULL,
    ruleset_hash   text NOT NULL UNIQUE,
    imported_at    timestamptz NOT NULL DEFAULT now(),
    approved_by    bytea,
    approval_sig   bytea,
    effective_from timestamptz,
    approved_at    timestamptz
);

CREATE TABLE recommendation (
    id              bigserial PRIMARY KEY,
    payment_id      bytea NOT NULL UNIQUE REFERENCES payment (id),
    ruleset_version text,                           -- null when no ruleset was effective
    recommendation  text NOT NULL,
    reason_codes    text[] NOT NULL,
    policy_ref      text NOT NULL,
    auto            boolean NOT NULL,
    inputs          jsonb NOT NULL,
    inputs_hash     text NOT NULL,
    engine_version  text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evidence_snapshot (
    payment_id    bytea PRIMARY KEY REFERENCES payment (id),
    pack_id       uuid NOT NULL UNIQUE,
    data          jsonb NOT NULL,
    salts         jsonb NOT NULL,
    evidence_root text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE decision (
    id           bigserial PRIMARY KEY,
    payment_id   bytea NOT NULL REFERENCES payment (id),
    nonce        bigint NOT NULL,
    decision     smallint NOT NULL CHECK (decision BETWEEN 1 AND 4),
    mode         text NOT NULL CHECK (mode IN ('AUTO_BY_POLICY', 'OFFICER_REVIEW')),
    policy_ref   text NOT NULL,
    reason_codes text[] NOT NULL,
    rationale    text NOT NULL,
    officer_id   text,
    signer       bytea NOT NULL,
    signature    bytea NOT NULL,
    pack_hash    text NOT NULL,                     -- evidence_root the decision was taken on
    deadline     bigint NOT NULL,
    typed_data   jsonb NOT NULL,
    decided_at   timestamptz NOT NULL,
    UNIQUE (payment_id, nonce)
);

CREATE TABLE pending_officer_request (
    payment_id bytea NOT NULL REFERENCES payment (id),
    decision   smallint NOT NULL,
    nonce      bigint NOT NULL,
    deadline   bigint NOT NULL,
    typed_data jsonb NOT NULL,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (payment_id, decision)
);

CREATE TABLE pack (
    pack_id        uuid NOT NULL,
    pack_version   integer NOT NULL,
    payment_id     bytea NOT NULL REFERENCES payment (id),
    seq            bigint NOT NULL UNIQUE,          -- journal order
    data           jsonb NOT NULL,
    salts          jsonb NOT NULL,
    master_root    text NOT NULL,
    evidence_root  text NOT NULL,
    jws            text NOT NULL,
    prev_pack_hash text NOT NULL,
    pack_hash      text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (pack_id, pack_version)
);

CREATE TABLE journal_head (
    id        integer PRIMARY KEY CHECK (id = 1),
    seq       bigint NOT NULL,
    pack_hash text NOT NULL
);
INSERT INTO journal_head VALUES (1, 0, repeat('0', 64));

CREATE TABLE projection (
    id              bigserial PRIMARY KEY,
    pack_id         uuid NOT NULL,
    pack_version    integer NOT NULL,
    profile         text NOT NULL,
    prepared_for    text NOT NULL,
    purpose         text NOT NULL,
    projection_hash text NOT NULL,
    issued_at       timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (pack_id, pack_version) REFERENCES pack (pack_id, pack_version)
);

CREATE FUNCTION reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;

CREATE TRIGGER check_result_append_only BEFORE UPDATE OR DELETE ON check_result
    FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER recommendation_append_only BEFORE UPDATE OR DELETE ON recommendation
    FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER evidence_snapshot_append_only BEFORE UPDATE OR DELETE ON evidence_snapshot
    FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER decision_append_only BEFORE UPDATE OR DELETE ON decision
    FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER pack_append_only BEFORE UPDATE OR DELETE ON pack
    FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER projection_append_only BEFORE UPDATE OR DELETE ON projection
    FOR EACH ROW EXECUTE FUNCTION reject_change();

CREATE FUNCTION ruleset_immutable_once_approved() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.approved_at IS NOT NULL THEN
        RAISE EXCEPTION 'ruleset % is approved and immutable', OLD.version;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER ruleset_immutable BEFORE UPDATE OR DELETE ON ruleset
    FOR EACH ROW EXECUTE FUNCTION ruleset_immutable_once_approved();
