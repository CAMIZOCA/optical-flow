import unittest

from fields import extract_fields


class FieldExtractionTests(unittest.TestCase):
    def test_explicit_labels_and_spaced_id(self):
        result = extract_fields("Nombres y apellidos: María José Pérez\nCédula: 17 1234 5678")
        self.assertEqual(result["name"], "María José Pérez")
        self.assertEqual(result["cedula"], "1712345678")
        self.assertTrue(result["review_required"])

    def test_two_fields_on_one_line(self):
        result = extract_fields("Paciente: José García C.I.: 1712345678 Teléfono: 0999999999")
        self.assertEqual(result["name"], "José García")
        self.assertEqual(result["cedula"], "1712345678")

    def test_value_on_next_line(self):
        result = extract_fields("Nombre del paciente:\nElena Demo\nCédula de identidad:\n1712345678")
        self.assertEqual(result["name"], "Elena Demo")
        self.assertEqual(result["cedula"], "1712345678")

    def test_missing_values_are_not_invented(self):
        result = extract_fields("Óptica Andina\nTeléfono: 1712345678\nOrden 123")
        self.assertIsNone(result["name"])
        self.assertIsNone(result["cedula"])

    def test_empty_label_does_not_capture_the_next_field(self):
        result = extract_fields("Nombre:\nDirección: Quito\nCédula:\nFecha: ayer")
        self.assertIsNone(result["name"])
        self.assertIsNone(result["cedula"])

    def test_conflicting_values_remain_unselected(self):
        result = extract_fields("Paciente: Ana López\nPaciente: Elena Demo\nCI: 1712345678\nCI: 1712345679")
        self.assertIsNone(result["name"])
        self.assertIsNone(result["cedula"])
        self.assertEqual(len(result["extraction"]["cedula_candidates"]), 2)

    def test_alphanumeric_or_wrong_length_id_is_not_repaired(self):
        for identifier in ("17123O5678", "123456789", "1712345678001"):
            with self.subTest(identifier=identifier):
                self.assertIsNone(extract_fields("Cédula: " + identifier)["cedula"])

    def test_duplicate_labels_do_not_create_ambiguity(self):
        result = extract_fields("Nombre: Ana López\nNombre: ANA LÓPEZ\nCI: 1712345678\nCI: 17-1234-5678")
        self.assertEqual(result["name"], "Ana López")
        self.assertEqual(result["cedula"], "1712345678")

    def test_unexpected_input_fails_explicitly(self):
        with self.assertRaises(TypeError):
            extract_fields(None)


if __name__ == "__main__":
    unittest.main()
