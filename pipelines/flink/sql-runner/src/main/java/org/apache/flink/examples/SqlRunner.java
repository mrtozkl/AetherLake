/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.flink.examples;

import org.apache.flink.configuration.ConfigOption;
import org.apache.flink.configuration.ConfigOptions;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.table.api.TableEnvironment;
import org.apache.flink.util.FileUtils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Main class for executing SQL scripts.
 *
 * <p>Vendored and adapted from the Apache Flink Kubernetes Operator example
 * (examples/flink-sql-runner-example, Apache-2.0). Adaptation for Flink 2.x:
 * SET statements are applied via {@link ConfigOptions} because the untyped
 * {@code Configuration#setString(String, String)} overload was removed.
 */
public class SqlRunner {

    private static final Logger LOG = LoggerFactory.getLogger(SqlRunner.class);

    private static final String STATEMENT_DELIMITER = ";"; // a statement should end with `;`
    private static final String LINE_DELIMITER = "\n";

    private static final String COMMENT_PATTERN = "(--.*)|(((\\/\\*)+?[\\w\\W]+?(\\*\\/)+))";

    private static final Pattern SET_STATEMENT_PATTERN =
            Pattern.compile("SET\\s+'(\\S+)'\\s+=\\s+'(.*)';", Pattern.CASE_INSENSITIVE);

    /**
     * ${ENV:NAME} placeholders are replaced with the value of the NAME
     * environment variable before parsing. The Control Panel injects platform
     * credentials (Polaris, MinIO) into the job pods so SQL scripts reference
     * secrets without embedding them — same syntax Trino uses in catalog
     * files.
     */
    private static final Pattern ENV_PLACEHOLDER_PATTERN =
            Pattern.compile("\\$\\{ENV:([A-Za-z_][A-Za-z0-9_]*)\\}");

    private static final String BEGIN_CERTIFICATE = "-----BEGIN CERTIFICATE-----";
    private static final String END_CERTIFICATE = "-----END CERTIFICATE-----";
    private static final String ESCAPED_BEGIN_CERTIFICATE = "======BEGIN CERTIFICATE=====";
    private static final String ESCAPED_END_CERTIFICATE = "=====END CERTIFICATE=====";

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            throw new Exception("Exactly one argument is expected.");
        }
        var script = substituteEnv(FileUtils.readFileUtf8(new File(args[0])));
        var statements = parseStatements(script);

        var tableEnv = TableEnvironment.create(new Configuration());

        for (String statement : statements) {
            Matcher setMatcher = SET_STATEMENT_PATTERN.matcher(statement.trim());

            if (setMatcher.matches()) {
                // Handle SET statements
                String key = setMatcher.group(1);
                String value = setMatcher.group(2);
                ConfigOption<String> option =
                        ConfigOptions.key(key).stringType().noDefaultValue();
                tableEnv.getConfig().getConfiguration().set(option, value);
            } else {
                LOG.info("Executing:\n{}", statement);
                tableEnv.executeSql(statement);
            }
        }
    }

    /** Replaces ${ENV:NAME} placeholders; fails fast on unknown variables. */
    public static String substituteEnv(String script) {
        Matcher matcher = ENV_PLACEHOLDER_PATTERN.matcher(script);
        StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            String name = matcher.group(1);
            String value = System.getenv(name);
            if (value == null) {
                throw new IllegalStateException(
                        "SQL references ${ENV:" + name + "} but the environment variable is not set");
            }
            matcher.appendReplacement(result, Matcher.quoteReplacement(value));
        }
        matcher.appendTail(result);
        return result.toString();
    }

    public static List<String> parseStatements(String script) {
        var formatted =
                formatSqlFile(script)
                        .replaceAll(BEGIN_CERTIFICATE, ESCAPED_BEGIN_CERTIFICATE)
                        .replaceAll(END_CERTIFICATE, ESCAPED_END_CERTIFICATE)
                        .replaceAll(COMMENT_PATTERN, "")
                        .replaceAll(ESCAPED_BEGIN_CERTIFICATE, BEGIN_CERTIFICATE)
                        .replaceAll(ESCAPED_END_CERTIFICATE, END_CERTIFICATE);

        var statements = new ArrayList<String>();

        StringBuilder current = null;
        boolean statementSet = false;
        for (String line : formatted.split("\n")) {
            var trimmed = line.trim();
            if (trimmed.isBlank()) {
                continue;
            }
            if (current == null) {
                current = new StringBuilder();
            }
            if (trimmed.startsWith("EXECUTE STATEMENT SET")) {
                statementSet = true;
            }
            current.append(trimmed);
            current.append("\n");
            if (trimmed.endsWith(STATEMENT_DELIMITER)) {
                if (!statementSet || trimmed.equals("END;")) {
                    statements.add(current.toString());
                    current = null;
                    statementSet = false;
                }
            }
        }
        return statements;
    }

    public static String formatSqlFile(String content) {
        String trimmed = content.trim();
        StringBuilder formatted = new StringBuilder();
        formatted.append(trimmed);
        if (!trimmed.endsWith(STATEMENT_DELIMITER)) {
            formatted.append(STATEMENT_DELIMITER);
        }
        formatted.append(LINE_DELIMITER);
        return formatted.toString();
    }
}
