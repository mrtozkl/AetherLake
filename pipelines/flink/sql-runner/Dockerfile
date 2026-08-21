# Flink SQL Runner image for AetherLake.
#
# Vendored and adapted from the Apache Flink Kubernetes Operator example
# (examples/flink-sql-runner-example, Apache-2.0). The upstream example expects
# a local `mvn package` run before `docker build`; this multi-stage build runs
# Maven inside Docker so only a Docker daemon is required (install.sh builds it
# automatically when the flink component is enabled).
#
# Classpath layout:
#   /opt/flink/lib     — connector jars (Kafka SQL connector, Iceberg Flink
#                        runtime + Hadoop). They must sit on Flink's main
#                        classpath: catalog factories (e.g. Iceberg's REST
#                        catalog) resolve classes through the app classloader,
#                        which cannot see the per-job usrlib jar.
#   /opt/flink/usrlib  — the thin SQL runner jar (main class only).
# FlinkDeployment CRs created by the Control Panel reference it via:
#   spec.image: aetherlake/flink-sql-runner:<tag>
#   spec.job.jarURI: local:///opt/flink/usrlib/sql-runner.jar
FROM maven:3.9-eclipse-temurin-11 AS builder
WORKDIR /build
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
# Thin runner jar (project classes only) plus the connector dependency jars
# for /opt/flink/lib. Excluded from the copy:
#   - logging jars: the Flink image ships its own log4j/slf4j;
#   - commons-cli: hadoop's ancient 1.2 shadows the one flink-dist needs
#     (NoSuchMethodError on Option.builder at entrypoint startup).
RUN mvn -B clean package && \
    mvn -q -B dependency:copy-dependencies -DoutputDirectory=/build/lib \
        -DincludeScope=runtime \
        -DexcludeArtifactIds=slf4j-api,log4j-api,log4j-core,log4j-slf4j2-impl,log4j-1.2-api,commons-cli

FROM flink:2.1
RUN mkdir -p /opt/flink/usrlib
COPY --from=builder /build/target/flink-sql-runner-example-*.jar /opt/flink/usrlib/sql-runner.jar
COPY --from=builder /build/lib/*.jar /opt/flink/lib/
