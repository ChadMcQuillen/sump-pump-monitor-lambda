resource "aws_sns_topic" "sump-pump-alerts" {
    name = "sump-pump-alerts-${var.env}"
}
