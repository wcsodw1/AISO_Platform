def parameters():
    # Requires a service exposing /v1/completions with streaming usage.
    # EOS cannot be forced portably; short output fails Full validation.
    return {}
