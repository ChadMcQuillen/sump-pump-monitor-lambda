resource "aws_lambda_function" "sump-pump-monitor" {
    function_name = "sump-pump-monitor-${var.env}"
    description = "Monitor sump pump water level"
    filename = "sump-pump-monitor.zip"
    source_code_hash = "${base64sha256(file("sump-pump-monitor.zip"))}"
    handler = "sump-pump-monitor.handler"
    runtime = "nodejs4.3"
    role = "${aws_iam_role.sump-pump-lambda-execution-role.arn}"
    timeout = "60"
    environment = {
        variables = {
            SUMP_PUMP_WATER_LEVEL_TABLE = "${aws_dynamodb_table.sump-pump-water-level.name}",
            SUMP_PUMP_ALERTS_TABLE = "${aws_dynamodb_table.sump-pump-alerts.name}",
            SUMP_PUMP_ALERTS_TOPIC = "${aws_sns_topic.sump-pump-alerts.arn}"
        }
    }
}
