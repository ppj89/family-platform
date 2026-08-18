FROM postgres:18.4-alpine

RUN apk add --no-cache python3 py3-pip \
  && python3 -m pip install --no-cache-dir --break-system-packages boto3

COPY backup.py /usr/local/bin/backup.py
COPY entrypoint.sh /usr/local/bin/db-backup-entrypoint
RUN chmod 0755 /usr/local/bin/backup.py /usr/local/bin/db-backup-entrypoint

ENTRYPOINT ["/usr/local/bin/db-backup-entrypoint"]
