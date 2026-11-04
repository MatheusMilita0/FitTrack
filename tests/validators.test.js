import { describe, it, expect } from "vitest";
import {
  validateCpf,
  validatePassword,
  validateName,
  validateEmail,
  validateWeight,
  normalizeAndValidateHeight,
  validateLoginIdentifier,
} from "../server/utils/validators.js";

describe("Validadores de Regras de Negócio (server/utils/validators.js)", () => {
  describe("RN10 - Validação Algorítmica de CPF", () => {
    it("deve aceitar CPFs válidos formatados e não formatados", () => {
      // CPFs válidos de teste gerados algoritmicamente
      expect(validateCpf("52998224725")).toBe(true);
      expect(validateCpf("529.982.247-25")).toBe(true);
      expect(validateCpf("11144477735")).toBe(true);
    });

    it("deve rejeitar CPFs com dígitos repetidos conhecidos", () => {
      expect(validateCpf("00000000000")).toBe(false);
      expect(validateCpf("11111111111")).toBe(false);
      expect(validateCpf("99999999999")).toBe(false);
    });

    it("deve rejeitar CPFs com tamanho incorreto ou caracteres insuficientes", () => {
      expect(validateCpf("123")).toBe(false);
      expect(validateCpf("1234567890")).toBe(false);
      expect(validateCpf("123456789012")).toBe(false);
      expect(validateCpf("")).toBe(false);
      expect(validateCpf(null)).toBe(false);
    });

    it("deve rejeitar CPFs com dígitos verificadores inválidos", () => {
      expect(validateCpf("52998224726")).toBe(false);
      expect(validateCpf("12345678900")).toBe(false);
    });
  });

  describe("RN02 - Validação de Senha Forte", () => {
    it("deve aceitar senhas com >= 6 caracteres, maiúscula e minúscula", () => {
      expect(validatePassword("Senha1")).toBe(true);
      expect(validatePassword("MinhaSenhaForte123!")).toBe(true);
      expect(validatePassword("Abcdef")).toBe(true);
    });

    it("deve rejeitar senhas com menos de 6 caracteres", () => {
      expect(validatePassword("Ab1")).toBe(false);
      expect(validatePassword("A1b2C")).toBe(false);
    });

    it("deve rejeitar senhas sem letra maiúscula", () => {
      expect(validatePassword("senha123")).toBe(false);
      expect(validatePassword("somente_minusculas")).toBe(false);
    });

    it("deve rejeitar senhas sem letra minúscula", () => {
      expect(validatePassword("SENHA123")).toBe(false);
      expect(validatePassword("SOMENTE_MAIUSCULAS")).toBe(false);
    });
  });

  describe("RN11 - Validação de Nome", () => {
    it("deve aceitar nomes válidos com letras, acentos e espaços", () => {
      expect(validateName("João da Silva")).toBe(true);
      expect(validateName("Maria Conceição")).toBe(true);
      expect(validateName("Érika D'Ávila")).toBe(false);
      expect(validateName("Ana")).toBe(true);
    });

    it("deve rejeitar nomes com números ou caracteres especiais proibidos", () => {
      expect(validateName("João123")).toBe(false);
      expect(validateName("Maria @ Silva")).toBe(false);
      expect(validateName("Carlos_Silva")).toBe(false);
    });

    it("deve rejeitar nomes menores que 2 ou maiores que 100 caracteres", () => {
      expect(validateName("A")).toBe(false);
      expect(validateName("A".repeat(101))).toBe(false);
    });
  });

  describe("RN12 - Validação de E-mail", () => {
    it("deve aceitar e-mails válidos", () => {
      expect(validateEmail("usuario@dominio.com")).toBe(true);
      expect(validateEmail("aluno.fitness@academia.com.br")).toBe(true);
      expect(validateEmail("user+tag@domain.co")).toBe(true);
    });

    it("deve rejeitar e-mails com ponto no início ou no fim", () => {
      expect(validateEmail(".usuario@dominio.com")).toBe(false);
      expect(validateEmail("usuario.@dominio.com")).toBe(false);
      expect(validateEmail("usuario@dominio.com.")).toBe(false);
      expect(validateEmail("usuario@.dominio.com")).toBe(false);
    });

    it("deve rejeitar e-mails com pontos consecutivos ou formato malformado", () => {
      expect(validateEmail("usuario..teste@dominio.com")).toBe(false);
      expect(validateEmail("sem-arroba.com")).toBe(false);
      expect(validateEmail("usuario@")).toBe(false);
      expect(validateEmail("@dominio.com")).toBe(false);
    });
  });

  describe("RN17 - Validação de Medidas Físicas (Peso e Altura)", () => {
    it("deve aceitar pesos dentro dos limites biológicos (20 a 400 kg)", () => {
      expect(validateWeight(20)).toBe(true);
      expect(validateWeight(75.5)).toBe(true);
      expect(validateWeight(400)).toBe(true);
      expect(validateWeight("82.3")).toBe(true);
    });

    it("deve rejeitar pesos fora dos limites (20 a 400 kg)", () => {
      expect(validateWeight(19.9)).toBe(false);
      expect(validateWeight(401)).toBe(false);
      expect(validateWeight(-10)).toBe(false);
      expect(validateWeight("invalido")).toBe(false);
    });

    it("deve aceitar e normalizar alturas em metros (1.0 a 2.5 m) e centímetros (100 a 250 cm)", () => {
      const resM = normalizeAndValidateHeight(1.78);
      expect(resM.valid).toBe(true);
      expect(resM.heightCm).toBe(178);

      const resCm = normalizeAndValidateHeight(175);
      expect(resCm.valid).toBe(true);
      expect(resCm.heightCm).toBe(175);
    });

    it("deve rejeitar alturas fora dos limites", () => {
      expect(normalizeAndValidateHeight(0.8).valid).toBe(false);
      expect(normalizeAndValidateHeight(3.0).valid).toBe(false);
      expect(normalizeAndValidateHeight(80).valid).toBe(false);
      expect(normalizeAndValidateHeight(260).valid).toBe(false);
      expect(normalizeAndValidateHeight("abc").valid).toBe(false);
    });
  });

  describe("RN01 - Validação de Identificador no Login", () => {
    it("deve aceitar e-mail válido ou CPF válido", () => {
      expect(validateLoginIdentifier("aluno@fittrack.com")).toBe(true);
      expect(validateLoginIdentifier("52998224725")).toBe(true);
      expect(validateLoginIdentifier("529.982.247-25")).toBe(true);
    });

    it("deve rejeitar credenciais com formato sintático inválido", () => {
      expect(validateLoginIdentifier("cpf_invalido_123")).toBe(false);
      expect(validateLoginIdentifier("11111111111")).toBe(false);
      expect(validateLoginIdentifier("email-invalido@")).toBe(false);
      expect(validateLoginIdentifier("")).toBe(false);
    });
  });
});
