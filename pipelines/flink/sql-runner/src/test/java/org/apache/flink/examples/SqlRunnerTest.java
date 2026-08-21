package org.apache.flink.examples;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SqlRunnerTest {

    @Test
    void testSubstituteEnv_replacesPresentVariables() {
        String path = System.getenv("PATH");
        assertNotNull(path, "PATH env should exist");

        String input = "SET 'my.path' = '${ENV:PATH}';";
        String result = SqlRunner.substituteEnv(input);

        assertEquals("SET 'my.path' = '" + path + "';", result);
    }

    @Test
    void testSubstituteEnv_throwsOnMissingVariable() {
        String input = "CREATE CATALOG lakehouse WITH ('credential' = '${ENV:NON_EXISTENT_SECRET_XYZ_123}');";
        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> SqlRunner.substituteEnv(input));
        assertTrue(ex.getMessage().contains("NON_EXISTENT_SECRET_XYZ_123"));
    }

    @Test
    void testSubstituteEnv_noPlaceholdersUnchanged() {
        String input = "SELECT * FROM iceberg.demo.events LIMIT 10;\n";
        String result = SqlRunner.substituteEnv(input);
        assertEquals(input, result);
    }

    @Test
    void testParseStatements_singleStatement() {
        String sql = "SELECT * FROM my_table;";
        List<String> statements = SqlRunner.parseStatements(sql);
        assertEquals(1, statements.size());
        assertEquals("SELECT * FROM my_table;\n", statements.get(0));
    }

    @Test
    void testParseStatements_multipleStatementsWithComments() {
        String sql = "-- Line comment\n"
                + "CREATE TABLE t1 (id INT);\n"
                + "/* Multi-line\n"
                + "   comment */\n"
                + "INSERT INTO t1 VALUES (1);\n";

        List<String> statements = SqlRunner.parseStatements(sql);
        assertEquals(2, statements.size());
        assertTrue(statements.get(0).contains("CREATE TABLE t1 (id INT);"));
        assertTrue(statements.get(1).contains("INSERT INTO t1 VALUES (1);"));
        assertFalse(statements.get(0).contains("Line comment"));
    }

    @Test
    void testParseStatements_executeStatementSet() {
        String sql = "EXECUTE STATEMENT SET\n"
                + "BEGIN\n"
                + "INSERT INTO t1 SELECT * FROM s1;\n"
                + "INSERT INTO t2 SELECT * FROM s2;\n"
                + "END;\n";

        List<String> statements = SqlRunner.parseStatements(sql);
        assertEquals(1, statements.size());
        String statement = statements.get(0);
        assertTrue(statement.startsWith("EXECUTE STATEMENT SET"));
        assertTrue(statement.contains("BEGIN"));
        assertTrue(statement.contains("INSERT INTO t1 SELECT * FROM s1;"));
        assertTrue(statement.contains("INSERT INTO t2 SELECT * FROM s2;"));
        assertTrue(statement.endsWith("END;\n"));
    }

    @Test
    void testFormatSqlFile_appendsSemicolonWhenMissing() {
        String formatted = SqlRunner.formatSqlFile("SELECT 1");
        assertEquals("SELECT 1;\n", formatted);

        String formattedWithSemicolon = SqlRunner.formatSqlFile("SELECT 1;");
        assertEquals("SELECT 1;\n", formattedWithSemicolon);
    }
}
