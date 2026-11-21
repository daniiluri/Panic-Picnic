"""Start the built arcade on local HTTPS for phones on the same Wi-Fi."""

import argparse
import ipaddress
import os
import shutil
import subprocess
from pathlib import Path

import uvicorn


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "address", type=ipaddress.IPv4Address, help="This computer's Wi-Fi IPv4 address"
    )
    parser.add_argument("--port", type=int, default=8443)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if not (root / "frontend-react/dist/index.html").is_file():
        parser.exit(
            1, "Build the frontend first with npm --prefix frontend-react run build.\n"
        )
    certs = root / ".certs"
    ca = certs / "ca"
    ca.mkdir(parents=True, exist_ok=True, mode=0o700)
    cert = certs / f"{args.address}.pem"
    key = certs / f"{args.address}-key.pem"
    if not (cert.is_file() and key.is_file() and (ca / "rootCA.pem").is_file()):
        binary = shutil.which("mkcert")
        if not binary:
            parser.exit(
                1, "Install mkcert to issue the local phone-play certificate.\n"
            )
        subprocess.run(
            [
                binary,
                "-cert-file",
                str(cert),
                "-key-file",
                str(key),
                str(args.address),
                "localhost",
                "127.0.0.1",
            ],
            env={**os.environ, "CAROOT": str(ca)},
            check=True,
        )
    print(
        f"Party URL   https://{args.address}:{args.port}\nPhone trust certificate   {ca / 'rootCA.pem'}",
        flush=True,
    )
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=args.port,
        ssl_certfile=str(cert),
        ssl_keyfile=str(key),
    )


if __name__ == "__main__":
    main()
