resource "aws_dynamodb_table" "sump-pump-water-level" {
    name = "sump-pump-water-level-${var.env}"
    read_capacity = "${var.read_capacity}"
    write_capacity = "${var.write_capacity}"
    hash_key = "sump-pump"
    range_key = "timestamp"
    attribute {
        name = "sump-pump"
        type = "S"
    }
    attribute {
        name = "timestamp"
        type = "S"
    }
}

resource "aws_dynamodb_table" "sump-pump-alerts" {
    name = "sump-pump-alerts-${var.env}"
    read_capacity = "${var.read_capacity}"
    write_capacity = "${var.write_capacity}"
    hash_key = "sump-pump"
    range_key = "timestamp-initial"
    attribute {
        name = "sump-pump"
        type = "S"
    }
    attribute {
        name = "timestamp-initial"
        type = "S"
    }
}
