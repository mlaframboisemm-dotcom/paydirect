#!/usr/bin/env python3
import pexpect
import sys

GCLOUD = '/home/ubuntu/google-cloud-sdk/google-cloud-sdk/bin/gcloud'
CODE = '4/0AXEQxID7u6Qw8Xe9ZUfBBqMqIcQV7C5sATCsfir_FPGnHGMX0u6pxpTotiYqZxdvCtU7-Q'

print("Starting gcloud auth login...")
child = pexpect.spawn(f'{GCLOUD} auth login --no-launch-browser', timeout=60, encoding='utf-8')

# Wait for the verification code prompt
idx = child.expect(['verification code provided in your browser:', pexpect.EOF, pexpect.TIMEOUT], timeout=20)
if idx == 0:
    print("Got prompt, sending code...")
    child.sendline(CODE)
    # Wait for success
    idx2 = child.expect(['You are now logged in', 'Saved Application Default Credentials', 'ERROR', pexpect.EOF, pexpect.TIMEOUT], timeout=30)
    remaining = child.before + (child.after or '')
    print(f"Auth result (idx={idx2}): {remaining[:300]}")
else:
    print("Did not get prompt, output:", child.before[:300])

child.close()
print(f"Exit code: {child.exitstatus}")
