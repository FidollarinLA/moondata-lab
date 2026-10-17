# MoonMotor Lab 开发约定

- Keep the numerical core in MoonBit. JavaScript may orchestrate it but must not silently replace its calculations.
- Read docs/PLAN.md and docs/METHODS.md before changing analysis behavior.
- Use ///| blocks and current MoonBit APIs; run moon info and moon fmt after public API changes.
- Test mathematical contracts using independent expected values, not snapshots of implementation output.
- Always distinguish built-in offline analysis, model-backed Agent, synthetic examples and measured experiments.
- Do not log or commit model credentials or user data. Use .local/ for private temporary material.
- Restrict Agent tools to explicit analysis functions. No generated shell, arbitrary code, network or filesystem tools.
- Keep UI Chinese-first and accessible. Show units, source filenames, analysis parameters and unavailable results.
- Run the applicable core, server and browser checks before claiming completion. Record limits honestly.
- No automatic multi-agent delegation. Work in this project only.
