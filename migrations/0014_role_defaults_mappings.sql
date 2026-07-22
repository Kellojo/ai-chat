-- 0014_role_defaults_mappings.sql
-- Allow role defaults to reference a model mapping in addition to a concrete
-- model. The mapping sentinel ("mapping:<id>") is not a models.id, so the FK on
-- model_id must be dropped. Role default rows whose model was deleted are
-- preserved; consumers treat unresolved refs as "no default".

CREATE TABLE _role_defaults_new (
  role TEXT PRIMARY KEY,
  model_id TEXT NOT NULL
);

INSERT INTO _role_defaults_new (role, model_id) SELECT role, model_id FROM role_defaults;
DROP TABLE role_defaults;
ALTER TABLE _role_defaults_new RENAME TO role_defaults;
