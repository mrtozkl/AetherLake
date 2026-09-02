import ast
import os
import unittest

class TestAirflowDAGs(unittest.TestCase):
    def setUp(self):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.dag_file = os.path.join(base_dir, "airflow", "dags", "lakehouse_pipeline.py")

    def test_dag_file_exists(self):
        self.assertTrue(os.path.isfile(self.dag_file), f"DAG file not found: {self.dag_file}")

    def test_dag_syntax_valid(self):
        """Ensure lakehouse_pipeline.py contains no syntax errors."""
        with open(self.dag_file, "r", encoding="utf-8") as f:
            source = f.read()
        parsed = ast.parse(source, filename=self.dag_file)
        self.assertIsNotNone(parsed)

    def test_expected_tasks_defined_in_dag(self):
        """Verify all critical Lakehouse pipeline tasks are defined in the DAG script."""
        with open(self.dag_file, "r", encoding="utf-8") as f:
            content = f.read()

        expected_tasks = [
            "trigger_pyspark_ingestion",
            "monitor_pyspark_ingestion",
            "run_dbt_transformations",
            "upsert_to_milvus",
        ]

        for task_id in expected_tasks:
            self.assertIn(task_id, content, f"Missing task '{task_id}' in DAG")

    def test_spark_manifest_structure(self):
        """Verify spark_app_manifest contains required Kubernetes SparkApplication spec."""
        with open(self.dag_file, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertIn("sparkoperator.k8s.io/v1beta2", content)
        self.assertIn("SparkApplication", content)
        self.assertIn("minio-to-iceberg-ingest", content)
        self.assertIn("ingest.py", content)

if __name__ == "__main__":
    unittest.main()
