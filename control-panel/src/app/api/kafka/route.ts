import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import * as k8s from "@kubernetes/client-node";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const coreApi = kc.makeApiClient(k8s.CoreV1Api);
const customApi = kc.makeApiClient(k8s.CustomObjectsApi);

const NAMESPACE = "aetherlake";

const KAFKA_GROUP = "kafka.strimzi.io";
// Strimzi 1.1.0 serves the kafka.strimzi.io CRDs in v1 only (v1beta2 was
// removed); matches the apiVersion used in templates/kafka-cluster.yaml.
const KAFKA_VERSION = "v1";

export interface KafkaCondition {
    type: string;
    status: string;
    lastTransitionTime?: string;
    message?: string;
}

export interface KafkaTopicSummary {
    name: string;
    partitions: number;
    replicas: number;
    ready: boolean;
    message: string | null;
    config: Record<string, unknown>;
}

export interface KafkaBrokerSummary {
    name: string;
    ready: boolean;
    restarts: number;
    nodeId: string | null;
}

export interface KafkaClusterSummary {
    name: string;
    ready: boolean;
    kafkaVersion: string | null;
    conditions: KafkaCondition[];
    listeners: { name: string; type?: string; port?: number }[];
    bootstrapServers: string | null;
}

function unwrap(res: unknown): any {
    return (res as any).body || res;
}

function conditionsOf(obj: any): KafkaCondition[] {
    return Array.isArray(obj?.status?.conditions) ? obj.status.conditions : [];
}

function isReady(obj: any): boolean {
    return conditionsOf(obj).some((c) => c.type === "Ready" && c.status === "True");
}

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Kafka cluster CR (Strimzi). The chart ships a single cluster named
        // after the release ("aetherlake"), but pick whatever exists.
        const kafkaList = unwrap(
            await customApi.listNamespacedCustomObject({
                group: KAFKA_GROUP,
                version: KAFKA_VERSION,
                namespace: NAMESPACE,
                plural: "kafkas",
            })
        );
        const kafka = (kafkaList.items || [])[0] || null;

        let cluster: KafkaClusterSummary | null = null;
        if (kafka) {
            const specListeners = kafka.spec?.kafka?.listeners || [];
            cluster = {
                name: kafka.metadata?.name || "aetherlake",
                ready: isReady(kafka),
                kafkaVersion: kafka.status?.kafkaVersion || kafka.spec?.kafka?.version || null,
                conditions: conditionsOf(kafka),
                listeners: specListeners.map((l: any) => ({ name: l.name, type: l.type, port: l.port })),
                bootstrapServers: kafka.status?.listeners?.find((l: any) => l.name === "plain")?.addresses?.[0]
                    ? `${kafka.status.listeners.find((l: any) => l.name === "plain").addresses[0].host}:${kafka.status.listeners.find((l: any) => l.name === "plain").addresses[0].port}`
                    : `${kafka.metadata?.name}-kafka-bootstrap:9092`,
            };
        }

        // Broker pods carry strimzi.io/component-type=kafka. The broader
        // strimzi.io/kind=Kafka label would also match the entity-operator
        // pod, which is not a broker.
        const podRes = unwrap(
            await coreApi.listNamespacedPod({
                namespace: NAMESPACE,
                labelSelector: "strimzi.io/component-type=kafka",
            })
        );
        const brokers: KafkaBrokerSummary[] = ((podRes.items || []) as any[]).map((pod) => ({
            name: pod.metadata?.name || "",
            ready: (pod.status?.containerStatuses || []).every((c: any) => c.ready) && pod.status?.phase === "Running",
            restarts: (pod.status?.containerStatuses || []).reduce((acc: number, c: any) => acc + (c.restartCount || 0), 0),
            nodeId: pod.metadata?.labels?.["strimzi.io/pool-name"] ?? null,
        }));

        // KafkaTopic CRs, reconciled by the Strimzi topic operator.
        const topicList = unwrap(
            await customApi.listNamespacedCustomObject({
                group: KAFKA_GROUP,
                version: KAFKA_VERSION,
                namespace: NAMESPACE,
                plural: "kafkatopics",
            })
        );
        const topics: KafkaTopicSummary[] = ((topicList.items || []) as any[])
            .map((topic) => {
                const readyCondition = conditionsOf(topic).find((c) => c.type === "Ready");
                return {
                    name: topic.metadata?.name || "",
                    partitions: topic.spec?.partitions ?? 0,
                    replicas: topic.spec?.replicas ?? 0,
                    ready: readyCondition?.status === "True",
                    message: readyCondition && readyCondition.status !== "True" ? readyCondition.message || null : null,
                    config: topic.spec?.config || {},
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json({ cluster, brokers, topics });
    } catch (error: any) {
        console.error("Kafka API error:", error);
        return NextResponse.json(
            { error: "Failed to fetch Kafka cluster state", details: error.message },
            { status: 500 }
        );
    }
}
