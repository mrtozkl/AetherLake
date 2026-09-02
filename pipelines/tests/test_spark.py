import ast
import os
import unittest

class TestSparkIngestion(unittest.TestCase):
    def setUp(self):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.spark_file = os.path.join(base_dir, "spark", "ingest.py")

    def test_spark_file_exists(self):
        self.assertTrue(os.path.isfile(self.spark_file), f"Spark file not found: {self.spark_file}")

    def test_spark_syntax_valid(self):
        """Ensure ingest.py contains no syntax errors."""
        with open(self.spark_file, "r", encoding="utf-8") as f:
            source = f.read()
        parsed = ast.parse(source, filename=self.spark_file)
        self.assertIsNotNone(parsed)

    def test_iceberg_and_s3_configurations(self):
        """Ensure Spark session configures Iceberg extensions and S3A endpoint properly."""
        with open(self.spark_file, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertIn("IcebergSparkSessionExtensions", content)
        self.assertIn("spark.hadoop.fs.s3a.endpoint", content)
        self.assertIn("spark.sql.catalog.lakehouse", content)
        self.assertIn("format(\"iceberg\")", content)

if __name__ == "__main__":
    unittest.main()
