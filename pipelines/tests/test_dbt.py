import os
import unittest
import yaml

class TestDbtConfigurations(unittest.TestCase):
    def setUp(self):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.dbt_dir = os.path.join(base_dir, "dbt")
        self.project_file = os.path.join(self.dbt_dir, "dbt_project.yml")
        self.profiles_file = os.path.join(self.dbt_dir, "profiles.yml")

    def test_dbt_project_yml(self):
        self.assertTrue(os.path.isfile(self.project_file), "dbt_project.yml missing")
        with open(self.project_file, "r", encoding="utf-8") as f:
            project_config = yaml.safe_load(f)

        self.assertEqual(project_config.get("name"), "lakehouse_transformations")
        self.assertEqual(project_config.get("profile"), "lakehouse_trino")
        self.assertIn("silver", project_config["models"]["lakehouse_transformations"])
        self.assertIn("gold", project_config["models"]["lakehouse_transformations"])

    def test_dbt_profiles_yml(self):
        self.assertTrue(os.path.isfile(self.profiles_file), "profiles.yml missing")
        with open(self.profiles_file, "r", encoding="utf-8") as f:
            profiles_config = yaml.safe_load(f)

        self.assertIn("lakehouse_trino", profiles_config)
        dev_output = profiles_config["lakehouse_trino"]["outputs"]["dev"]
        self.assertEqual(dev_output.get("type"), "trino")
        self.assertEqual(dev_output.get("catalog"), "iceberg")
        self.assertEqual(dev_output.get("host"), "core-data-stack-trino")
        self.assertEqual(dev_output.get("port"), 8443)

if __name__ == "__main__":
    unittest.main()
