///|
test "Park Miller independent reference values" {
  let values = @generator.random_sequence(1, 3)
  assert_true(values[0].is_close(16807.0 / 2147483647.0))
  assert_true(values[1].is_close(282475249.0 / 2147483647.0))
  assert_true(values[2].is_close(1622650073.0 / 2147483647.0))
  assert_eq(values, @generator.random_sequence(1, 3))
}
