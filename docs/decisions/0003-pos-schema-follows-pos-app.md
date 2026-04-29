---
status: Accepted
date: 2026-04-29
tags: [structure, repo layout, database]
---

# 0003 — POS schema follows the POS app

## Context

Wrong Tabletot POS code initially, led to this major changes in the schema.

## Decision

The POS schema now follows the POS app directly, rather than trying to fit the menu.json. Tabletot POS is just a adapter.

## Alternatives considered


## Consequences

Migrations become a bit harder. 
