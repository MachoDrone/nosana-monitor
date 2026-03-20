FROM python:3.12-alpine
RUN apk add --no-cache curl jq
COPY monitor.sh /app/monitor.sh
COPY derive-pubkey.py /app/derive-pubkey.py
RUN chmod +x /app/monitor.sh /app/derive-pubkey.py
WORKDIR /app
ENTRYPOINT ["/app/monitor.sh"]
