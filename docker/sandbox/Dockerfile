# codepulse-sandbox — lightweight execution environment
#
# Contains:
#   • Node.js 20 (JavaScript execution)
#   • g++ / gcc via build-essential (C++ compilation and execution)
#
# Security posture applied at docker run time (see sandbox.ts):
#   --network none        no outbound connections
#   --memory 128m         hard memory cap
#   --cpus 0.5            half a core max
#   --pids-limit 64       blocks fork bombs
#   --read-only           immutable container filesystem
#   --tmpfs /tmp          writable scratch space inside container only
#   --user nobody         drops root privileges
#   --rm                  auto-remove on exit

FROM node:20-slim

# Install C++ toolchain. Clean up apt cache immediately to keep the layer small.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential \
 && rm -rf /var/lib/apt/lists/*

# Code is bind-mounted to /code at run time — no COPY needed.
# The container's entry point is supplied dynamically per-language by the host.
WORKDIR /code
