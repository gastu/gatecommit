## ADDED Requirements

### Requirement: TOML table headers SHALL end Wrangler binding rows

GateCommit SHALL continue validating TOML Wrangler configuration. While parsing TOML, every standard table or array-of-tables header SHALL finalize the active binding row and clear binding capture state. GateCommit SHALL capture resource fields only in recognized D1, KV, and R2 binding array tables. A `binding` key in an unrelated table SHALL NOT mutate or replace a prior binding declaration.

When parsing Wrangler TOML, every standard table or array-of-tables header SHALL finalize the active binding row and clear binding capture state. GateCommit SHALL capture resource fields only in recognized D1, KV, and R2 binding array tables. A `binding` key in an unrelated table SHALL NOT mutate or replace a prior binding declaration.

#### Scenario: An ordinary table follows duplicate binding rows

- **WHEN** duplicate resource bindings in one scope are followed by `[vars]` containing a `binding` key
- **THEN** GateCommit SHALL preserve both resource declarations
- **AND** the duplicate SHALL remain BLOCKED

#### Scenario: Resource tables cross environments and table kinds

- **WHEN** TOML resource tables are separated by ordinary tables or other array tables and appear in multiple environments
- **THEN** GateCommit SHALL retain each row in its correct resource and environment scope
