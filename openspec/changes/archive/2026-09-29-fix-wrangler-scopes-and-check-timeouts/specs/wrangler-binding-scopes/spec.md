# Wrangler binding scopes

## ADDED Requirements

### Requirement: Wrangler bindings SHALL be validated independently per environment scope

GateCommit SHALL treat the top-level Wrangler configuration as the base scope
and each `env.<name>` configuration as a separate scope. It SHALL validate D1,
KV, and R2 binding shape and uniqueness independently within each scope. A
binding name repeated in the base scope and an environment scope SHALL be
valid. A duplicate binding or D1 logical database name within one scope SHALL
produce BLOCKED.

#### Scenario: Base and production D1 declarations reuse a binding name

- **WHEN** the base scope and `env.production` each declare the same valid D1
  binding and logical name
- **THEN** GateCommit SHALL validate them as separate scopes
- **AND** the D1 configuration check SHALL pass

#### Scenario: D1 declarations duplicate a binding in one scope

- **WHEN** two D1 declarations in the base scope have the same binding name
- **THEN** the D1 configuration check SHALL be BLOCKED with the duplicate
  scope identified

#### Scenario: Base and production KV declarations reuse a binding name

- **WHEN** the base scope and `env.production` each declare the same valid KV
  binding name
- **THEN** the KV configuration check SHALL pass

#### Scenario: KV declarations duplicate a binding in one scope

- **WHEN** two KV declarations in the same scope have the same binding name
- **THEN** the KV configuration check SHALL be BLOCKED with the duplicate
  scope identified

#### Scenario: Base and production R2 declarations reuse a binding name

- **WHEN** the base scope and `env.production` each declare the same valid R2
  binding name
- **THEN** the R2 configuration check SHALL pass

#### Scenario: R2 declarations duplicate a binding in one scope

- **WHEN** two R2 declarations in the same scope have the same binding name
- **THEN** the R2 configuration check SHALL be BLOCKED with the duplicate
  scope identified

#### Scenario: Base-only and multiple-environment Wrangler configurations

- **WHEN** Wrangler configuration contains only base declarations or contains
  multiple named environments
- **THEN** GateCommit SHALL validate each present scope independently

#### Scenario: Wrangler capability is absent

- **WHEN** the repository has no Wrangler configuration capability
- **THEN** Wrangler and its D1, KV, and R2 configuration checks SHALL report
  N/A with a reason
