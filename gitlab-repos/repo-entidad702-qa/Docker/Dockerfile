FROM alpine:3.19 AS downloader

RUN apk add --no-cache curl unzip

WORKDIR /opt
RUN curl -L \
    --cookie "oraclelicense=accept-securebackup-cookie" \
    --retry 3 --fail \
    -o /tmp/sqlcl.zip \
    "https://download.oracle.com/otn_software/java/sqldeveloper/sqlcl-24.3.2.330.1718.zip" && \
    unzip -q /tmp/sqlcl.zip -d /opt

FROM eclipse-temurin:17-jre-alpine

RUN apk add --no-cache bash coreutils findutils ncurses libstdc++

COPY --from=downloader /opt/sqlcl /opt/sqlcl

RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    chown -R appuser:appgroup /opt/sqlcl && \
    chmod -R 755 /opt/sqlcl/bin/sql

ENV PATH=/opt/sqlcl/bin:${PATH}

RUN sql -v

USER appuser
WORKDIR /home/appuser
