# Flink SQL Runner image for AetherLake.
#
# Vendored and adapted from the Apache Flink Kubernetes Operator example
# (examples/flink-sql-runner-example, Apache-2.0). The upstream example expects
# a local `mvn package` run before `docker build`; this multi-stage build runs
# Maven inside Docker so only a Docker daemon is required (install.sh builds it
# automatically when the flink component is enabled).
#
# The image layers the shaded SQL runner fat jar (which includes the Kafka SQL
# connector) on top of the official Flink runtime image. FlinkDeployment CRs
# created by the Control Panel reference it via:
#   spec.image: aetherlake/flink-sql-runner:<tag>
#   spec.job.jarURI: local:///opt/flink/usrlib/sql-runner.jar
FROM maven:3.9-eclipse-temurin-11 AS builder
WORKDIR /build
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B clean package -DskipTests

FROM flink:2.1
RUN mkdir -p /opt/flink/usrlib
COPY --from=builder /build/target/flink-sql-runner-example-*.jar /opt/flink/usrlib/sql-runner.jar
