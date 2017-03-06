resource "aws_iam_role" "sump-pump-lambda-execution-role" {
    name = "sump-pump-lambda-execution-role-${var.env}"
    assume_role_policy = <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Action": "sts:AssumeRole",
            "Principal": {
                "Service": "lambda.amazonaws.com"
            },
            "Effect": "Allow",
            "Sid": ""
        }
    ]
}
EOF
}

resource "aws_iam_policy" "sump-pump-lambda-execution-policy" {
    name = "sump-pump-lambda-execution-policy-${var.env}"
    description = "Sump pump monitor lambda function required policies"
    policy = <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:GetRecords",
                "dynamodb:GetShardIterator",
                "dynamodb:PutItem",
                "dynamodb:Query",
                "dynamodb:UpdateItem"
            ],
            "Resource": [
                "${aws_dynamodb_table.sump-pump-water-level.arn}",
                "${aws_dynamodb_table.sump-pump-alerts.arn}"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "sns:Publish"
            ],
            "Resource": "${aws_sns_topic.sump-pump-alerts.arn}"
        }
    ]
}
EOF
}

resource "aws_iam_policy_attachment" "sump-pump-policy-attachment" {
    name = "sump-pump-policy-attachment-${var.env}"
    roles = ["${aws_iam_role.sump-pump-lambda-execution-role.name}"]
    policy_arn = "${aws_iam_policy.sump-pump-lambda-execution-policy.arn}"
}
