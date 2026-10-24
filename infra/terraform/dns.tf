data "aws_route53_zone" "vprocly" {
  name = var.domain
}

resource "aws_route53_record" "root" {
  zone_id = data.aws_route53_zone.vprocly.zone_id
  name    = var.domain
  type    = "A"
  ttl     = 60
  records = [aws_eip.app.public_ip]
}

resource "aws_route53_record" "www" {
  zone_id = data.aws_route53_zone.vprocly.zone_id
  name    = "www.${var.domain}"
  type    = "CNAME"
  ttl     = 60
  records = [var.domain]
}

resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.vprocly.zone_id
  name    = "api.${var.domain}"
  type    = "A"
  ttl     = 60
  records = [aws_eip.app.public_ip]
}

resource "aws_route53_record" "auth" {
  zone_id = data.aws_route53_zone.vprocly.zone_id
  name    = "auth.${var.domain}"
  type    = "A"
  ttl     = 60
  records = [aws_eip.app.public_ip]
}

resource "aws_route53_record" "operations" {
  zone_id = data.aws_route53_zone.vprocly.zone_id
  name    = "operations.${var.domain}"
  type    = "A"
  ttl     = 60
  records = [aws_eip.app.public_ip]
}
